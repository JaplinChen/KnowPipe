/**
 * Xiaohongshu (小紅書) extractor — Browser Use CLI version.
 * Uses real Chrome with preserved login state instead of Camoufox.
 * POC: co-exists with the original Camoufox-based extractor.
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

/** Extract content from HTML using regex (no DOM API needed) */
function extractFromHtml(html: string) {
  const getText = (pattern: RegExp): string => {
    const m = html.match(pattern);
    return m?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  };

  // Title: #detail-title or common title selectors
  const title = getText(/id="detail-title"[^>]*>([^<]+)/i)
    || getText(/<h1[^>]*>([^<]+)/i);

  // Description: #detail-desc or common desc selectors
  const desc = getText(/id="detail-desc"[^>]*>([\s\S]*?)<\/div/i)
    || getText(/class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div/i)
    || getText(/class="[^"]*note-content[^"]*"[^>]*>([\s\S]*?)<\/div/i);

  // Author
  const author = getText(/class="[^"]*author-name[^"]*"[^>]*>([^<]+)/i)
    || getText(/class="[^"]*username[^"]*"[^>]*>([^<]+)/i)
    || getText(/class="[^"]*user-nickname[^"]*"[^>]*>([^<]+)/i);

  // Author handle from link
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

  // Fallback: collect all img src containing xhscdn (XHS CDN)
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

  // Likes
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
    const client = new BrowserUseClient('getthreads-xhs');

    try {
      // Navigate — real Chrome retains XHS login cookies
      await client.open(resolvedUrl);

      // Brief wait for dynamic content rendering
      await new Promise((r) => setTimeout(r, 2000));

      // Detect login wall via page text
      const pageText = await client.text();
      if (
        pageText.includes('登录') ||
        pageText.includes('登入') ||
        pageText.includes('手机号登录') ||
        pageText.includes('扫码')
      ) {
        // Check URL too
        const currentUrl = await client.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
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
    } finally {
      // Don't close session — keep daemon alive for next request (~50ms reuse)
    }
  },
};
