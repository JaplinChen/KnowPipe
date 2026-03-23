export const JINA_REMOVE_SELECTORS = '';
import type { ExtractedContent, Extractor } from './types.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';
import { stripHtmlTags } from './web-cleaner.js';
import {
  htmlToMarkdown, htmlToMarkdownWithBrowser, htmlToMarkdownWithBrowserUse,
  htmlToMarkdownWithDefuddle,
} from '../utils/html-to-markdown.js';

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeHtml(m[1]).trim();
  }
  return '';
}

function extractTitle(html: string): string {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return ogTitle.slice(0, 100);
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return 'Untitled';
  return decodeHtml(m[1]).replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';
}

/** Regex-based fallback when Readability cannot extract article content */
function extractBodyFallback(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const articleMatch = noScript.match(/<(article|main)[^>]*>([\s\S]*?)<\/(article|main)>/i);
  const source = articleMatch?.[2] ?? noScript;
  const text = decodeHtml(stripHtmlTags(source)).replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 6000 ? text.slice(0, 6000) + '\n\n...(truncated)' : text;
}

function absolutizeImage(url: string, pageUrl: string): string {
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return url;
  }
}

export const webExtractor: Extractor = {
  platform: 'web',

  match(_url: string): boolean {
    return true;
  },

  parseId(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  },

  async extract(url: string): Promise<ExtractedContent> {
    const res = await fetchWithTimeout(url, 30_000, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (GetThreads Bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Web fetch error: ${res.status} ${res.statusText} for ${url}`);
    }

    const html = await res.text();
    if (!html || html.length < 100) throw new Error('Web page returned empty content');

    const finalUrl = res.url || url;

    // Tier 0: Defuddle CLI (direct URL→Markdown, best quality)
    // Tier 1: Readability + Turndown on raw HTML
    // Tier 2: Camoufox browser rendering (JS-rendered pages, anti-fingerprint)
    // Tier 3: Browser Use CLI rendering (lightweight headless Chromium fallback)
    // Tier 4: Regex extraction (final fallback)
    let parsed = await htmlToMarkdownWithDefuddle(finalUrl);
    if (!parsed) {
      parsed = htmlToMarkdown(html, finalUrl);
    }
    if (!parsed) {
      try {
        parsed = await htmlToMarkdownWithBrowser(finalUrl);
      } catch {
        // Tier 2.5: OpenCLI (reuses Chrome login state)
        const { fetchHtmlWithOpenCli } = await import('../utils/opencli-client.js');
        const ocHtml = await fetchHtmlWithOpenCli(finalUrl);
        if (ocHtml) parsed = htmlToMarkdown(ocHtml, finalUrl, true);
      }
    }
    if (!parsed) {
      {
        // Tier 2.8: pinchtab (lightweight Go headless browser)
        const { fetchHtmlWithPinchtab } = await import('../utils/pinchtab-client.js');
        const ptHtml = await fetchHtmlWithPinchtab(finalUrl);
        if (ptHtml) parsed = htmlToMarkdown(ptHtml, finalUrl, true);

        if (!parsed) {
          try {
            parsed = await htmlToMarkdownWithBrowserUse(finalUrl);
          } catch {
            // All browser fallbacks unavailable
          }
        }
      }
    }
    // Tier 3.5: Cloudflare Browser Rendering (needs API key in .env)
    if (!parsed) {
      const { fetchHtmlWithCloudflare } = await import('../utils/cloudflare-crawler.js');
      const cfHtml = await fetchHtmlWithCloudflare(finalUrl);
      if (cfHtml) parsed = htmlToMarkdown(cfHtml, finalUrl, true);
    }

    let title: string;
    let text: string;

    if (parsed) {
      title = parsed.title || extractTitle(html);
      const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
      text = [description, parsed.markdown].filter(Boolean).join('\n\n').trim();
    } else {
      title = extractTitle(html);
      const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
      const body = extractBodyFallback(html);
      text = [description, body].filter(Boolean).join('\n\n').trim();
    }

    if (!text) text = '[No readable text]';

    const imageSet = new Set<string>();
    const ogImage = extractMeta(html, 'og:image');
    if (ogImage) imageSet.add(absolutizeImage(ogImage, finalUrl));

    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const m of imgMatches) {
      const src = m[1];
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
      imageSet.add(absolutizeImage(src, finalUrl));
      if (imageSet.size >= 8) break;
    }

    let domain = url;
    try {
      domain = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      // keep original
    }

    // Use Defuddle metadata when available
    const author = parsed?.byline || domain;
    const date = parsed?.publishedDate || new Date().toISOString().split('T')[0];

    return {
      platform: 'web',
      author,
      authorHandle: domain,
      title,
      text,
      images: [...imageSet],
      videos: [],
      date,
      url,
    };
  },
};

