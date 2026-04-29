/** Reddit extractor — JSON API (tier 1) + Camoufox + cookie injection (tier 2) */
import type { ExtractedContent, ExtractorWithComments, ThreadComment } from './types.js';
import { readCookiesForDomain, injectChromeCookies } from '../utils/chrome-cookies.js';
import { camoufoxPool } from '../utils/camoufox-pool.js';

const REDDIT_POST_RE = /reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── helpers ────────────────────────────────────────────────────────────────

type RedditChild = { kind: string; data: Record<string, unknown> };
type RedditReplies = { data?: { children?: RedditChild[] } } | '';

function parseComments(children: RedditChild[], depth = 0, limit = 30): ThreadComment[] {
  if (depth > 2) return [];
  const results: ThreadComment[] = [];
  for (const child of children) {
    if (results.length >= limit) break;
    if (child.kind !== 't1') continue;
    const d = child.data;
    const body = d.body as string | undefined;
    if (!body || body === '[deleted]' || body === '[removed]') continue;

    const comment: ThreadComment = {
      author: (d.author as string) ?? '[deleted]',
      authorHandle: `u/${(d.author as string) ?? 'deleted'}`,
      text: body,
      date: d.created_utc
        ? new Date((d.created_utc as number) * 1000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      likes: d.score as number | undefined,
    };

    const replies = d.replies as RedditReplies;
    if (replies && typeof replies === 'object' && replies.data?.children?.length) {
      const nested = parseComments(replies.data.children as RedditChild[], depth + 1, 5);
      if (nested.length) comment.replies = nested;
    }
    results.push(comment);
  }
  return results;
}

async function cookieHeader(): Promise<string> {
  const cookies = await readCookiesForDomain('reddit.com');
  // HTTP header Cookie must be ASCII-only (ByteString); skip cookies with garbled decryption
  const safe = cookies.filter(c => /^[\x20-\x7E]*$/.test(c.value));
  return safe.map(c => `${c.name}=${c.value}`).join('; ');
}

// ─── tier 1: JSON API ────────────────────────────────────────────────────────

async function fetchJsonApi(url: string, commentLimit = 25): Promise<ExtractedContent | null> {
  const cookie = await cookieHeader();
  const jsonUrl = url.split('?')[0].replace(/\/$/, '') + `.json?limit=${commentLimit}&raw_json=1`;

  const res = await fetch(jsonUrl, {
    headers: {
      'User-Agent': UA,
      ...(cookie ? { Cookie: cookie } : {}),
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return null;
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;

  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data) || !data.length) return null;

  const listing = data[0] as { data: { children: RedditChild[] } };
  const post = listing?.data?.children?.[0]?.data;
  if (!post) return null;

  const isSelf = post.is_self as boolean;
  const externalUrl = post.url as string;
  const bodyText = (post.selftext as string) || '';
  const text = bodyText || (isSelf ? '' : `[Link] ${externalUrl}`);
  const title = (post.title as string) ?? '';

  // Collect images: linked image or gallery
  const images: string[] = [];
  if (externalUrl && /\.(jpg|jpeg|png|gif|webp)/i.test(externalUrl)) {
    images.push(externalUrl);
  }
  const meta = post.media_metadata as Record<string, { e: string; s?: { u?: string } }> | undefined;
  if (meta) {
    for (const item of Object.values(meta)) {
      if (item.e === 'Image' && item.s?.u) {
        images.push(item.s.u.replace(/&amp;/g, '&'));
      }
    }
  }

  const commentListing = data[1] as { data: { children: RedditChild[] } } | undefined;
  const comments = commentListing?.data?.children
    ? parseComments(commentListing.data.children, 0, commentLimit)
    : [];

  return {
    platform: 'reddit',
    author: (post.author as string) ?? '[deleted]',
    authorHandle: `u/${(post.author as string) ?? 'deleted'}`,
    title,
    text: text || title,
    images,
    videos: [],
    date: post.created_utc
      ? new Date((post.created_utc as number) * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    url,
    likes: post.score as number | undefined,
    commentCount: post.num_comments as number | undefined,
    comments,
    extraTags: post.subreddit ? [`r/${post.subreddit as string}`] : undefined,
  };
}

// ─── tier 2: Camoufox + Chrome cookie injection ──────────────────────────────

async function fetchViaCamoufox(url: string): Promise<ExtractedContent> {
  const match = url.match(REDDIT_POST_RE);
  const subreddit = match?.[1] ?? '';

  const { page, release } = await camoufoxPool.acquire();
  try {
    await injectChromeCookies(page, 'reddit.com').catch(() => {});
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const bodySnippet = await page
      .evaluate(() => document.body.innerText.slice(0, 600))
      .catch(() => '');

    if (
      bodySnippet.includes('Log in') &&
      bodySnippet.includes('Sign up') &&
      bodySnippet.length < 1200
    ) {
      throw new Error('Reddit: 需要登入才能查看此貼文（Chrome cookie 注入失敗）');
    }

    const title = await page
      .evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1?.textContent?.trim() ?? document.title.replace(/ : .*$/, '').trim();
      })
      .catch(() => '');

    const text = await page
      .evaluate(() => {
        const selectors = [
          '[data-click-id="text"]',
          '.usertext-body',
          'shreddit-post [slot="text-body"]',
        ];
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return '';
      })
      .catch(() => '');

    const author = await page
      .evaluate(() => {
        const el = document.querySelector('a[href*="/user/"]');
        return el?.getAttribute('href')?.match(/\/user\/([^/]+)/)?.[1] ?? '';
      })
      .catch(() => '');

    if (!text && !title) {
      throw new Error('Reddit: 無法擷取貼文內容（頁面結構可能已變更）');
    }

    return {
      platform: 'reddit',
      author: author || 'unknown',
      authorHandle: author ? `u/${author}` : 'unknown',
      title: title || text.slice(0, 80),
      text: text || title,
      images: [],
      videos: [],
      date: new Date().toISOString().split('T')[0],
      url,
      extraTags: subreddit ? [`r/${subreddit}`] : undefined,
    };
  } finally {
    await release();
  }
}

// ─── extractor export ────────────────────────────────────────────────────────

export const redditExtractor: ExtractorWithComments = {
  platform: 'reddit',

  match(url: string): boolean {
    return REDDIT_POST_RE.test(url);
  },

  parseId(url: string): string | null {
    return url.match(REDDIT_POST_RE)?.[2] ?? null;
  },

  async extract(url: string): Promise<ExtractedContent> {
    const jsonResult = await fetchJsonApi(url).catch(() => null);
    if (jsonResult && (jsonResult.text || jsonResult.title)) return jsonResult;
    return fetchViaCamoufox(url);
  },

  async extractComments(url: string, limit = 25): Promise<ThreadComment[]> {
    const cookie = await cookieHeader();
    const jsonUrl = url.split('?')[0].replace(/\/$/, '') + `.json?limit=${limit}&raw_json=1`;
    try {
      const res = await fetch(jsonUrl, {
        headers: {
          'User-Agent': UA,
          ...(cookie ? { Cookie: cookie } : {}),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return [];
      if (!(res.headers.get('content-type') ?? '').includes('json')) return [];
      const data = (await res.json()) as unknown[];
      const commentListing = data[1] as { data: { children: RedditChild[] } } | undefined;
      return commentListing?.data?.children
        ? parseComments(commentListing.data.children, 0, limit)
        : [];
    } catch {
      return [];
    }
  },
};
