/**
 * Reddit Extractor
 *
 * Uses the public Reddit JSON API (no authentication required).
 * Supports: reddit.com/r/subreddit/comments/id/title/
 */

import type { ExtractedContent, Extractor, ThreadComment } from './types.js';
import { fetchWithTimeout, retry } from '../utils/fetch-with-timeout.js';
import { logger } from '../core/logger.js';

const POST_RE = /reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i;

const HEADERS = {
  'User-Agent': 'KnowPipe/1.0 (content archiver)',
  Accept: 'application/json',
};

interface RedditPost {
  title: string;
  author: string;
  selftext: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  thumbnail?: string;
  preview?: { images?: Array<{ source: { url: string } }> };
}

interface RedditComment {
  kind: string;
  data: {
    author: string;
    body: string;
    score: number;
    created_utc: number;
  };
}

function htmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function extractTopComments(comments: RedditComment[], limit = 10): ThreadComment[] {
  const results: ThreadComment[] = [];
  for (const c of comments) {
    if (c.kind !== 't1') continue;
    const { author, body, score, created_utc } = c.data;
    if (!body || body === '[deleted]' || body === '[removed]') continue;
    results.push({
      author,
      authorHandle: `u/${author}`,
      text: htmlEntities(body).slice(0, 500),
      date: new Date(created_utc * 1000).toISOString().split('T')[0],
      likes: score,
    });
    if (results.length >= limit) break;
  }
  return results;
}

export const redditExtractor: Extractor = {
  platform: 'reddit',

  match(url: string): boolean {
    return POST_RE.test(url);
  },

  parseId(url: string): string | null {
    return url.match(POST_RE)?.[2] ?? null;
  },

  async extract(url: string): Promise<ExtractedContent> {
    const match = url.match(POST_RE);
    if (!match) throw new Error(`Invalid Reddit URL: ${url}`);

    const [, subreddit, postId] = match;
    // Remove trailing slash and query string for clean API URL
    const cleanPath = `/r/${subreddit}/comments/${postId}/`;
    const apiUrl = `https://www.reddit.com${cleanPath}.json`;
    logger.info('reddit', `fetching post ${postId} from r/${subreddit}`);

    const res = await retry(async () => {
      const r = await fetchWithTimeout(apiUrl, 15_000, { headers: HEADERS });
      if (!r.ok) throw new Error(`Reddit API HTTP ${r.status}`);
      return r;
    }, 2, 1000);

    const data = await res.json() as [
      { data: { children: Array<{ data: RedditPost }> } },
      { data: { children: RedditComment[] } },
    ];

    const post = data[0].data.children[0]?.data;
    if (!post) throw new Error(`Reddit post not found: ${url}`);
    const commentNodes = data[1].data.children;

    const comments = extractTopComments(commentNodes);

    const selftext = post.selftext ? htmlEntities(post.selftext) : '';
    // External link (link posts) — include if different domain from reddit
    const isExternal = post.url && !post.url.includes('reddit.com') && post.url !== url;
    const text = [
      selftext,
      isExternal ? `**外部連結**: ${post.url}` : '',
    ].filter(Boolean).join('\n\n') || '[Link post — no text content]';

    // Best quality image: preview > thumbnail
    const previewUrl = post.preview?.images?.[0]?.source?.url;
    const image = previewUrl
      ? htmlEntities(previewUrl)
      : (post.thumbnail?.startsWith('http') ? post.thumbnail : '');

    return {
      platform: 'reddit',
      author: post.author,
      authorHandle: `u/${post.author}`,
      title: htmlEntities(post.title),
      text: text.slice(0, 8000),
      images: image ? [image] : [],
      videos: [],
      date: new Date(post.created_utc * 1000).toISOString().split('T')[0],
      url,
      likes: post.score,
      commentCount: post.num_comments,
      comments,
      extraTags: [`r/${post.subreddit}`],
    };
  },
};
