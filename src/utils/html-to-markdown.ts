/**
 * HTML → Markdown conversion using Defuddle CLI / Readability + Turndown.
 *
 * Provides entry points:
 *   - htmlToMarkdownWithDefuddle(): Defuddle CLI for direct URL→Markdown (preferred)
 *   - htmlToMarkdown(): full-page article extraction via Readability + Turndown (fallback)
 *   - htmlToMarkdownWithBrowser(): Camoufox fallback for JS-rendered pages
 *   - htmlFragmentToMarkdown(): direct Turndown on an HTML snippet (e.g. GitHub README)
 */

import { parseHTML } from 'linkedom';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
// @ts-expect-error — no type declarations for turndown-plugin-gfm
import { gfm } from 'turndown-plugin-gfm';
import { camoufoxPool } from './camoufox-pool.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HtmlToMarkdownResult {
  title: string;
  markdown: string;
  excerpt: string;
  byline: string | null;
  publishedDate?: string;
  siteName?: string;
}

const MAX_MARKDOWN_LENGTH = 8000;

/** Resolve a base URL to its origin (protocol + host) */
function resolveBaseOrigin(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Create a configured Turndown instance (shared config) */
function createTurndown(baseUrl?: string): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  td.use(gfm);

  const origin = baseUrl ? resolveBaseOrigin(baseUrl) : null;

  // Resolve relative links to absolute URLs
  if (origin) {
    td.addRule('resolveRelativeLinks', {
      filter: (node: HTMLElement) => {
        if (node.nodeName !== 'A') return false;
        const href = node.getAttribute('href') || '';
        return href.startsWith('/') && !href.startsWith('//');
      },
      replacement: (content: string, node: HTMLElement) => {
        const href = node.getAttribute('href') || '';
        const resolved = `${origin}${href}`;
        return content ? `[${content}](${resolved})` : '';
      },
    });

    td.addRule('resolveRelativeImages', {
      filter: (node: HTMLElement) => {
        if (node.nodeName !== 'IMG') return false;
        const src = node.getAttribute('src') || '';
        return src.startsWith('/') && !src.startsWith('//');
      },
      replacement: (_content: string, node: HTMLElement) => {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        const resolved = `${origin}${src}`;
        return `![${alt}](${resolved})`;
      },
    });
  }

  // Remove badge images (shields.io etc.)
  td.addRule('removeBadges', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'IMG') return false;
      const src = node.getAttribute('src') || '';
      return /shields\.io|badge|img\.shields/i.test(src);
    },
    replacement: () => '',
  });

  // Remove empty anchor links (GitHub heading anchors like [](#section))
  td.addRule('removeEmptyAnchors', {
    filter: (node: HTMLElement) => {
      if (node.nodeName !== 'A') return false;
      return !node.textContent?.trim() && !!node.getAttribute('href')?.startsWith('#');
    },
    replacement: () => '',
  });

  return td;
}

/**
 * Extract article content from a full HTML page using Readability,
 * then convert to Markdown via Turndown.
 *
 * Returns null if the page is not article-like or Readability fails,
 * allowing the caller to fall back to regex-based extraction.
 *
 * @param skipHeuristic - if true, skip isProbablyReaderable check (used for browser-rendered HTML)
 */
export function htmlToMarkdown(
  html: string,
  url: string,
  skipHeuristic = false,
): HtmlToMarkdownResult | null {
  const { document } = parseHTML(html);

  if (!skipHeuristic && !isProbablyReaderable(document)) return null;

  const article = new Readability(document, { charThreshold: 200 }).parse();
  if (!article?.content) return null;

  const td = createTurndown(url);
  let markdown = td.turndown(article.content);

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n...(truncated)';
  }

  return {
    title: (article.title || '').slice(0, 100),
    markdown,
    excerpt: (article.excerpt || '').slice(0, 300),
    byline: article.byline ?? null,
  };
}

/**
 * Fallback: render page with Camoufox browser, then extract with Readability + Turndown.
 * Used when fetch() HTML fails Readability (JS-rendered content).
 */
export async function htmlToMarkdownWithBrowser(url: string): Promise<HtmlToMarkdownResult | null> {
  const { page, release } = await camoufoxPool.acquire();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for main content to render
    await page.waitForTimeout(3000);
    const html = await page.content();
    return htmlToMarkdown(html, url, true);
  } finally {
    await release();
  }
}

/**
 * Fallback: render page with Browser Use CLI (headless Chromium), then extract.
 * Used when Camoufox is unavailable or fails. Does not require login — suitable
 * for public JS-rendered pages only.
 */
export async function htmlToMarkdownWithBrowserUse(url: string): Promise<HtmlToMarkdownResult | null> {
  const { BrowserUseClient } = await import('./browser-use-client.js');
  const client = new BrowserUseClient('getthreads-web');
  try {
    await client.open(url);
    // Wait for JS rendering
    await new Promise((r) => setTimeout(r, 3000));
    const html = await client.html();
    if (!html || html.length < 200) return null;
    return htmlToMarkdown(html, url, true);
  } catch {
    return null;
  }
}

/**
 * Extract article content from a URL using Defuddle CLI (npx defuddle parse).
 * Returns structured result with Markdown content, or null if Defuddle fails.
 * Defuddle is preferred over Readability: better noise removal, direct Markdown output.
 */
export async function htmlToMarkdownWithDefuddle(url: string): Promise<HtmlToMarkdownResult | null> {
  try {
    const { stdout } = await execFileAsync('npx', ['defuddle', 'parse', url, '--json'], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const data = JSON.parse(stdout) as {
      contentMarkdown?: string; content?: string; title?: string;
      author?: string; published?: string; site?: string; description?: string;
    };
    const markdown = data.contentMarkdown || '';
    if (!markdown || markdown.length < 50) return null;

    return {
      title: (data.title || '').slice(0, 100),
      markdown: markdown.length > MAX_MARKDOWN_LENGTH
        ? markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n...(truncated)'
        : markdown,
      excerpt: (data.description || '').slice(0, 300),
      byline: data.author || null,
      publishedDate: data.published || undefined,
      siteName: data.site || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Convert an HTML fragment (not a full page) to Markdown.
 * Used for pre-extracted content like GitHub README <article> blocks.
 * @param baseUrl — optional source URL for resolving relative links/images
 */
export function htmlFragmentToMarkdown(htmlFragment: string, baseUrl?: string): string {
  const td = createTurndown(baseUrl);
  let markdown = td.turndown(htmlFragment);

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n...(truncated)';
  }

  return markdown;
}
