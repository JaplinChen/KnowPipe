/**
 * ITHome 鐵人賽 Extractor
 *
 * Handles two URL patterns:
 *   - Series index: /users/{uid}/ironman/{seriesId}  → series metadata + article list
 *   - Single article: /articles/{articleId}          → article content extraction
 */

import { parseHTML } from 'linkedom';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';
import { htmlFragmentToMarkdown } from '../utils/html-to-markdown.js';
import type {
  ExtractedContent,
  ExtractorWithSeries,
  SeriesArticle,
} from './types.js';

const ITHOME_HOST = 'ithelp.ithome.com.tw';
const SERIES_RE = /\/users\/\d+\/ironman\/\d+/;
const ARTICLE_RE = /\/articles\/\d+/;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

async function fetchPage(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, 15_000, {
    headers: HEADERS,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`ITHome fetch ${res.status}: ${url}`);
  return res.text();
}

/** Parse all article entries from a single series page */
function parseArticleList(html: string): SeriesArticle[] {
  const { document: doc } = parseHTML(html);
  const items = doc.querySelectorAll('.qa-list');
  const articles: SeriesArticle[] = [];

  for (const item of items) {
    const link = item.querySelector('a[href*="/articles/"]');
    if (!link) continue;
    const href = link.getAttribute('href')?.trim();
    const title = link.textContent?.trim() || '';
    if (!href) continue;

    const url = href.startsWith('http')
      ? href
      : `https://${ITHOME_HOST}${href}`;
    const dayMatch = title.match(/Day\s*(\d+)/i);
    articles.push({
      title,
      url,
      day: dayMatch ? parseInt(dayMatch[1], 10) : undefined,
    });
  }
  return articles;
}

/** Fetch all pages of a series index and collect every article link */
async function fetchAllSeriesArticles(
  baseUrl: string,
): Promise<{ seriesTitle: string; author: string; total: number; articles: SeriesArticle[] }> {
  const firstHtml = await fetchPage(baseUrl);
  const { document: doc } = parseHTML(firstHtml);

  const seriesTitle =
    doc.querySelector('.ir-profile-content h3')?.textContent?.trim()
      ?.replace(/\s*系列\s*$/, '') || 'ITHome 系列';
  const author =
    doc.querySelector('.profile-header__name')?.textContent?.trim()
      ?.replace(/\s*\(.*\)$/, '') || ITHOME_HOST;
  const totalMatch = doc
    .querySelector('.ir-profile-content')
    ?.textContent?.match(/共\s*(\d+)\s*篇/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  let articles = parseArticleList(firstHtml);

  // Paginate: ?page=2, ?page=3, ...
  if (total > articles.length) {
    const pages = Math.ceil(total / 10);
    for (let p = 2; p <= pages; p++) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const pageHtml = await fetchPage(`${baseUrl}${sep}page=${p}`);
      articles = articles.concat(parseArticleList(pageHtml));
      // Brief pause between pages
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { seriesTitle, author, total: total || articles.length, articles };
}

/** Extract content from a single ITHome article page */
async function extractArticle(url: string): Promise<ExtractedContent> {
  const html = await fetchPage(url);
  const { document: doc } = parseHTML(html);

  const title =
    doc.querySelector('.qa-header__title')?.textContent?.trim() ||
    doc.querySelector('h2')?.textContent?.trim() ||
    doc.querySelector('title')?.textContent?.trim() ||
    'Untitled';

  const authorEl = doc.querySelector(
    '.ir-article-info__name, .qa-header__info-person a',
  );
  const author = authorEl?.textContent?.trim() || ITHOME_HOST;

  const dateEl = doc.querySelector('.qa-header__info-time, time');
  const dateText = dateEl?.textContent?.trim() || '';
  const date = dateText.slice(0, 10) || new Date().toISOString().split('T')[0];

  // Content: convert HTML to markdown
  const contentEl = doc.querySelector('.qa-markdown, .markdown-body');
  let text = '';
  if (contentEl) {
    const contentHtml = contentEl.innerHTML || contentEl.textContent || '';
    text = htmlFragmentToMarkdown(contentHtml);
  }
  if (!text) text = '[No readable content]';

  // Images inside content
  const images: string[] = [];
  if (contentEl) {
    const imgEls = contentEl.querySelectorAll('img');
    for (const img of imgEls) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        try {
          images.push(new URL(src, url).toString());
        } catch {
          // skip
        }
      }
      if (images.length >= 8) break;
    }
  }

  return {
    platform: 'ithome',
    author,
    authorHandle: ITHOME_HOST,
    title,
    text,
    images,
    videos: [],
    date,
    url,
  };
}

/** Build an index note for the series (not a real article — used as overview) */
function buildSeriesIndexContent(
  seriesTitle: string,
  author: string,
  seriesUrl: string,
  articles: SeriesArticle[],
): ExtractedContent {
  const lines = articles.map((a, i) => {
    const num = a.day ?? i + 1;
    return `${num}. [${a.title}](${a.url})`;
  });

  const text = [
    `**${author}** | 共 ${articles.length} 篇`,
    '',
    '## 系列文章目錄',
    '',
    ...lines,
  ].join('\n');

  return {
    platform: 'ithome',
    author,
    authorHandle: ITHOME_HOST,
    title: seriesTitle,
    text,
    images: [],
    videos: [],
    date: new Date().toISOString().split('T')[0],
    url: seriesUrl,
    extraTags: ['series-index'],
  };
}

export const ithomeExtractor: ExtractorWithSeries = {
  platform: 'ithome',

  match(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname === ITHOME_HOST || u.hostname === `www.${ITHOME_HOST}`;
    } catch {
      return false;
    }
  },

  parseId(url: string): string | null {
    const artMatch = url.match(/\/articles\/(\d+)/);
    if (artMatch) return artMatch[1];
    const seriesMatch = url.match(/\/ironman\/(\d+)/);
    if (seriesMatch) return `series-${seriesMatch[1]}`;
    return null;
  },

  isSeries(url: string): boolean {
    return SERIES_RE.test(url);
  },

  async extractSeriesArticles(url: string) {
    return fetchAllSeriesArticles(url);
  },

  async extract(url: string): Promise<ExtractedContent> {
    if (SERIES_RE.test(url)) {
      const { seriesTitle, author, articles } =
        await fetchAllSeriesArticles(url);
      return buildSeriesIndexContent(seriesTitle, author, url, articles);
    }

    if (ARTICLE_RE.test(url)) {
      return extractArticle(url);
    }

    // Fallback: treat as generic article attempt
    return extractArticle(url);
  },
};
