/**
 * Lightweight metadata fetcher for URLs found in post text or comments.
 * Uses platform APIs (GitHub REST, fxTwitter) for known URLs,
 * falls back to Jina Reader for generic web pages.
 * Each URL gets its own AbortController; partial failures are OK.
 */

import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';
import type { LinkedContentMeta } from '../extractors/types.js';

/** Entry describing a URL to enrich and where it was found */
export interface UrlEntry {
  url: string;
  source: 'post' | 'comment';
  mentionedBy?: string;
}

/* ------------------------------------------------------------------ */
/*  URL extraction from text                                          */
/* ------------------------------------------------------------------ */

const URL_RE = /https?:\/\/[^\s)>\]]+/gi;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;

/** Extract all URLs from a piece of text (handles both bare URLs and markdown links) */
export function extractUrlsFromText(text: string): string[] {
  const urls = new Set<string>();
  // Markdown links first
  for (const m of text.matchAll(MARKDOWN_LINK_RE)) urls.add(m[2]);
  // Bare URLs
  for (const m of text.matchAll(URL_RE)) {
    // Trim trailing punctuation that isn't part of the URL
    const cleaned = m[0].replace(/[.,;:!?'"。，；：！？）】]+$/, '');
    urls.add(cleaned);
  }
  return [...urls];
}

/* ------------------------------------------------------------------ */
/*  Platform detection                                                */
/* ------------------------------------------------------------------ */

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;
const TWITTER_STATUS_RE = /^https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/;

/* ------------------------------------------------------------------ */
/*  Single URL enrichment                                             */
/* ------------------------------------------------------------------ */

async function enrichGitHub(owner: string, repo: string): Promise<Omit<LinkedContentMeta, 'url' | 'source' | 'mentionedBy'>> {
  const res = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, 10_000, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'GetThreads-Bot' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json() as {
    full_name?: string; description?: string;
    stargazers_count?: number; language?: string;
  };
  return {
    title: data.full_name ?? `${owner}/${repo}`,
    description: data.description ?? undefined,
    platform: 'github',
    stars: data.stargazers_count,
    language: data.language ?? undefined,
  };
}

async function enrichTweet(user: string, id: string): Promise<Omit<LinkedContentMeta, 'url' | 'source' | 'mentionedBy'>> {
  const res = await fetchWithTimeout(`https://api.fxtwitter.com/${user}/status/${id}`, 10_000);
  if (!res.ok) throw new Error(`fxTwitter API ${res.status}`);
  const data = await res.json() as { tweet?: { text?: string; author?: { name?: string } } };
  const text = data.tweet?.text ?? '';
  return {
    title: data.tweet?.author?.name ? `@${user}` : `@${user}`,
    description: text.length > 200 ? text.slice(0, 200) + '...' : text,
    platform: 'x',
  };
}

async function enrichWebPage(url: string): Promise<Omit<LinkedContentMeta, 'url' | 'source' | 'mentionedBy'>> {
  const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, 15_000, {
    headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
  });
  if (!res.ok) throw new Error(`Jina Reader ${res.status}`);
  const text = await res.text();
  // Jina returns: Title: ...\nURL: ...\n\ncontent
  const titleMatch = text.match(/^Title:\s*(.+)/m);
  const title = titleMatch?.[1]?.trim() ?? new URL(url).hostname;
  // Skip header lines, get content preview
  const bodyStart = text.indexOf('\n\n');
  const body = bodyStart > 0 ? text.slice(bodyStart + 2) : text;
  const preview = body.slice(0, 200).replace(/\n/g, ' ').trim();
  return {
    title,
    description: preview.length > 0 ? (preview.length >= 200 ? preview + '...' : preview) : undefined,
    platform: 'web',
  };
}

async function enrichSingleUrl(entry: UrlEntry): Promise<LinkedContentMeta> {
  const { url, source, mentionedBy } = entry;

  let meta: Omit<LinkedContentMeta, 'url' | 'source' | 'mentionedBy'>;

  const ghMatch = url.match(GITHUB_REPO_RE);
  if (ghMatch) {
    meta = await enrichGitHub(ghMatch[1], ghMatch[2]);
  } else {
    const twMatch = url.match(TWITTER_STATUS_RE);
    if (twMatch) {
      meta = await enrichTweet(twMatch[1], twMatch[2]);
    } else {
      meta = await enrichWebPage(url);
    }
  }

  return { url, source, mentionedBy, ...meta };
}

/* ------------------------------------------------------------------ */
/*  Batch enrichment (public API)                                     */
/* ------------------------------------------------------------------ */

/**
 * Fetch lightweight metadata for a batch of URLs.
 * Each URL has its own timeout; partial failures are silently dropped.
 */
export async function enrichLinkedUrls(entries: UrlEntry[]): Promise<LinkedContentMeta[]> {
  if (entries.length === 0) return [];
  const results = await Promise.allSettled(entries.map(e => enrichSingleUrl(e)));
  return results
    .filter((r): r is PromiseFulfilledResult<LinkedContentMeta> => r.status === 'fulfilled')
    .map(r => r.value);
}
