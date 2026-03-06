/**
 * Web extractor — uses Jina Reader (r.jina.ai) to extract any web article.
 * Based on Agent-Reach's WebChannel: https://github.com/Panniantong/Agent-Reach
 * Acts as fallback; register LAST so specific extractors take priority.
 */
import type { ExtractedContent, Extractor } from './types.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';

const JINA_PREFIX = 'https://r.jina.ai/';

/** Jina Reader error signals — these indicate the target URL was inaccessible */
const JINA_ERROR_SIGNALS = [
  'Warning: Target URL returned error',
  "You've been blocked by network security",
  'Access denied',
  'Error 403',
  'Error 404',
  'Blocked by',
  'Please log in',
  'Sign in to continue',
];

/** Jina metadata prefixes to skip when looking for a title */
const JINA_META_PREFIX = ['Title:', 'URL Source:', 'Published Time:', 'Markdown Content:'];

/** Extract title: first `# Heading` or `Title:` header, skip other Jina metadata */
function parseTitle(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (JINA_META_PREFIX.some(p => trimmed.startsWith(p) && p !== 'Title:')) continue;
    if (trimmed.startsWith('# ')) return trimmed.slice(2).trim().slice(0, 100);
    if (trimmed.startsWith('Title:')) return trimmed.slice(6).trim().slice(0, 100);
    return trimmed.slice(0, 100);
  }
  return 'Untitled';
}

/** Remove blob: image references (browser-local URLs, useless in vault) */
function removeBlobImages(markdown: string): string {
  return markdown.replace(/!\[.*?\]\(blob:[^)]+\)/g, '');
}

/** Strip Jina Reader metadata block (Title: / URL Source: / Published Time: lines) */
function stripJinaHeader(markdown: string): string {
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith('Title:') ||
      trimmed.startsWith('URL Source:') ||
      trimmed.startsWith('Published Time:') ||
      trimmed === ''
    ) {
      i++;
    } else {
      break;
    }
  }
  return lines.slice(i).join('\n').trim();
}

/** Lines matching these are always removed (nav, footer, chrome) */
const CHROME_LINE_RE = [
  /登入[\/|]?註冊|登录[\/|]?注册|sign\s*in|sign\s*up/i,
  /^(首[頁页]|home|搜[尋索]|search)\s*$/i,
  /^(cookie|privacy|terms|disclaimer|copyright|©|advertisements?\s*$)/i,
  /^(跳至主要內容|skip to (?:main )?content)/i,
  /^={3,}\s*$/,   // separator "======="
  /^-{5,}\s*$/,   // separator "------"
  /^\*\s*$/,      // empty bullet "* "
  /累計瀏覽|站內簡訊|追蹤$/,
  /^\d+\s*$/,     // lone numbers (view counts, IDs)
];

/** URL patterns indicating ad/tracking links */
const AD_URL_RE = /\/ads\/click|itadapi\.|doubleclick|googlesyndication|adservice|\/login\b/i;

/** Remove site chrome: nav menus, ads, footers, author profiles, isolated link lists */
function cleanWebChrome(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { result.push(lines[i]); continue; }

    // Skip lines matching chrome patterns
    if (CHROME_LINE_RE.some(p => p.test(trimmed))) continue;

    // Skip ad/tracking links
    if (AD_URL_RE.test(trimmed)) continue;

    // Skip clickable image banners: [![...](img)](link)
    if (/^\[!\[.*?\]\(https?:\/\/[^)]+\)\]\(https?:\/\/[^)]+\)\s*$/.test(trimmed)) continue;

    // Skip standalone small images (avatars, logos) — short img markdown
    if (/^!\[Image \d+[:\]]/i.test(trimmed) && trimmed.length < 120) continue;

    // Skip short link-only lines in blocks (nav/promo)
    if (/^\[?.{1,35}\]?\(https?:\/\/[^)]+\)\s*$/.test(trimmed)) {
      const prev = i > 0 ? lines[i - 1].trim() : '';
      const next = i < lines.length - 1 ? lines[i + 1].trim() : '';
      const isLink = (s: string) => /\]\(https?:\/\//.test(s) && s.length < 80;
      if (isLink(prev) || isLink(next) || !prev) continue;
    }

    // Skip bullet nav items: "* [text](url)" or "*   [text](url)"
    if (/^\*\s+\[.{1,20}\]\(https?:\/\/[^)]+\)\s*$/.test(trimmed)) {
      const prev = i > 0 ? lines[i - 1].trim() : '';
      const next = i < lines.length - 1 ? lines[i + 1].trim() : '';
      if (/^\*\s+\[/.test(prev) || /^\*\s+\[/.test(next)) continue;
    }

    // Skip short non-content lines (nav text clusters like "問答 文章 Tag 邦友")
    if (trimmed.length < 30 && /^[\p{L}\s]+$/u.test(trimmed) && trimmed.split(/\s+/).length >= 3) {
      continue;
    }

    result.push(lines[i]);
  }

  return result.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

export const webExtractor: Extractor = {
  platform: 'web',

  match(_url: string): boolean {
    return true; // Fallback — handles any URL
  },

  parseId(url: string): string | null {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  },

  async extract(url: string): Promise<ExtractedContent> {
    const jinaUrl = `${JINA_PREFIX}${url}`;
    const res = await fetchWithTimeout(jinaUrl, 30_000, {
      headers: {
        Accept: 'text/markdown, text/plain, */*',
        'X-Return-Format': 'markdown',
      },
    });

    if (!res.ok) {
      throw new Error(`Jina Reader error: ${res.status} ${res.statusText} for ${url}`);
    }

    const markdown = await res.text();
    if (!markdown || markdown.length < 50) {
      throw new Error('Jina Reader returned empty content');
    }

    if (JINA_ERROR_SIGNALS.some((s) => markdown.includes(s))) {
      throw new Error(`Jina Reader 無法抓取此頁面（可能需要登入或被封鎖）：${markdown.slice(0, 80)}`);
    }

    const title = parseTitle(markdown);

    // Guard: if the parsed title looks like an error page, reject early
    const ERROR_TITLE_RE = /^(warning[:\s]|error\s*\d{3}|access denied|forbidden|you've been blocked)/i;
    if (ERROR_TITLE_RE.test(title)) {
      throw new Error(`Jina Reader 返回錯誤頁面：${title}`);
    }

    const text = cleanWebChrome(removeBlobImages(stripJinaHeader(markdown)));

    // Extract domain as "author" stand-in
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // keep raw url
    }

    // Extract images referenced in markdown
    const images: string[] = [];
    const imgRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(text)) !== null) {
      const imgUrl = match[1];
      if (!imgUrl.startsWith('blob:')) {
        images.push(imgUrl);
      }
    }

    return {
      platform: 'web',
      author: domain,
      authorHandle: domain,
      title,
      text,
      images,
      videos: [],
      date: new Date().toISOString().split('T')[0],
      url,
    };
  },
};
