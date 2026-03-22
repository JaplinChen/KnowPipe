/**
 * Xiaohongshu (小紅書) extractor — Browser Use CLI version.
 * Uses real Chrome with preserved login state instead of Camoufox.
 * POC: co-exists with the original Camoufox-based extractor.
 *
 * Requirements:
 *   - browser-use CLI installed (curl -fsSL https://browser-use.com/cli/install.sh | bash)
 *   - User must be logged in to XHS in their Chrome browser
 *   - Chrome must be in a path browser-use can discover
 *
 * Tested against browser-use 0.12.x CLI (2026-03).
 */
import type { ExtractedContent, Extractor } from './types.js';
import { BrowserUseClient } from '../utils/browser-use-client.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';

const XHS_PATTERN = /xiaohongshu\.com\/explore\/([\w]+)/i;
const XHS_LINK_PATTERN = /xhslink\.com\/([\w]+)/i;
const XHS_DISCOVER_PATTERN = /xiaohongshu\.com\/discovery\/item\/([\w]+)/i;

function parseNoteId(url: string): string | null {
  return (
    url.match(XHS_PATTERN)?.[1] ??
    url.match(XHS_DISCOVER_PATTERN)?.[1] ??
    url.match(XHS_LINK_PATTERN)?.[1] ??
    null
  );
}

async function resolveShortUrl(url: string): Promise<string> {
  if (!XHS_LINK_PATTERN.test(url)) return url;
  try {
    const res = await fetchWithTimeout(url, 15_000, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    });
    return res.url;
  } catch {
    return url;
  }
}

/** Login wall keywords found in XHS pages */
const LOGIN_WALL_KEYWORDS = ['登录', '登入', '手机号登录', '扫码'];

/** Extract content from HTML using regex (no DOM API needed) */
function extractFromHtml(html: string) {
  const getText = (pattern: RegExp): string => {
    const m = html.match(pattern);
    return m?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  };

  const title = getText(/id="detail-title"[^>]*>([^<]+)/i)
    || getText(/<h1[^>]*>([^<]+)/i);

  const desc = getText(/id="detail-desc"[^>]*>([\s\S]*?)<\/div/i)
    || getText(/class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div/i)
    || getText(/class="[^"]*note-content[^"]*"[^>]*>([\s\S]*?)<\/div/i);

  const author = getText(/class="[^"]*author-name[^"]*"[^>]*>([^<]+)/i)
    || getText(/class="[^"]*username[^"]*"[^>]*>([^<]+)/i)
    || getText(/class="[^"]*user-nickname[^"]*"[^>]*>([^<]+)/i);

  const handleMatch = html.match(/class="[^"]*author-wrapper[^"]*"[^>]*>.*?href="([^"]+)"/is)
    ?? html.match(/class="[^"]*user-info[^"]*".*?href="([^"]+)"/is);
  const authorHandle = handleMatch?.[1]?.split('/').pop() ?? '';

  // Images: note-image, swiper-slide, media-container
  const images: string[] = [];
  const imgPattern = /(?:note-image|swiper-slide|media-container)[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    const src = imgMatch[1];
    if (src && !src.includes('avatar') && !src.includes('icon')) {
      images.push(src);
    }
  }

  // Fallback: XHS CDN images
  if (images.length === 0) {
    const cdnPattern = /<img[^>]+(?:src|data-src)="(https?:\/\/[^"]*xhscdn[^"]+)"/gi;
    let cdnMatch: RegExpExecArray | null;
    while ((cdnMatch = cdnPattern.exec(html)) !== null) {
      const src = cdnMatch[1];
      if (!src.includes('avatar') && !src.includes('icon')) {
        images.push(src);
      }
    }
  }

  const likesText = getText(/class="[^"]*like[^"]*"[^>]*>.*?<span[^>]*>([^<]+)/is);
  const likesNum = parseInt(likesText.replace(/[^\d]/g, '') || '0', 10);

  return { title, desc, author, authorHandle, images: [...new Set(images)], likesNum };
}

export const xiaohongshuBrowserUseExtractor: Extractor = {
  platform: 'xhs',

  match(url: string): boolean {
    return XHS_PATTERN.test(url) || XHS_LINK_PATTERN.test(url) || XHS_DISCOVER_PATTERN.test(url);
  },

  parseId(url: string): string | null {
    return parseNoteId(url);
  },

  async extract(url: string): Promise<ExtractedContent> {
    const resolvedUrl = await resolveShortUrl(url);
    // headed = false for background extraction; user's Chrome cookies via daemon session
    const client = new BrowserUseClient('getthreads-xhs');

    // Navigate to the page
    await client.open(resolvedUrl);

    // Wait for dynamic content rendering
    await new Promise((r) => setTimeout(r, 3000));

    // Detect login wall via page text (using eval since `get text` needs element index)
    const pageText = await client.text();
    const hasLoginWall = LOGIN_WALL_KEYWORDS.some((kw) => pageText.includes(kw));

    if (hasLoginWall) {
      // Double-check via URL
      const currentUrl = await client.url();
      if (
        currentUrl.includes('/login') ||
        currentUrl.includes('/signin') ||
        // If page is mostly login content (short text with login keywords)
        pageText.length < 500
      ) {
        throw new Error('小紅書需要登入才能查看此內容（無法在未登入情況下抓取）');
      }
    }

    // Get full HTML for content extraction
    const html = await client.html();
    const { title, desc, author, authorHandle, images, likesNum } = extractFromHtml(html);

    // Fallback: use page text if HTML parsing yielded nothing
    const text = desc || title || pageText.slice(0, 2000);
    const noteTitle = title || text.split('\n')[0].slice(0, 80);

    return {
      platform: 'xhs',
      author: author || '未知',
      authorHandle: authorHandle ? `@${authorHandle}` : `@${author || '未知'}`,
      title: noteTitle,
      text,
      images,
      videos: [],
      date: new Date().toISOString().split('T')[0],
      url: resolvedUrl,
      likes: likesNum || undefined,
    };
    // Don't close session — keep daemon alive for next request (~50ms reuse)
  },
};
