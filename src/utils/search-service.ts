/**
 * Search service — DDG (POST + Camoufox), AI query rewriting + filtering.
 * Shared by /monitor and /google commands.
 */
import type { ExtractedContent } from '../extractors/types.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';
import { camoufoxPool } from './camoufox-pool.js';
import { isOmlxAvailable, omlxChatCompletion } from './omlx-client.js';
import { logger } from '../core/logger.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Domains filtered from all web searches (irrelevant system pages). */
const SKIP_DOMAINS = [
  'help.x.com', 'support.x.com', 'help.twitter.com', 'support.twitter.com',
  'about.x.com', 'about.twitter.com', 'business.x.com', 'business.twitter.com',
];

function isSkipDomain(hostname: string): boolean {
  return SKIP_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
}

export async function searchReddit(keyword: string, limit = 5): Promise<ExtractedContent[]> {
  const results = await searchDuckDuckGo(`site:reddit.com ${keyword}`, limit);
  return results.map((r) => ({
    platform: 'reddit' as const,
    author: 'unknown',
    authorHandle: 'u/unknown',
    title: r.title,
    text: r.snippet || `[Linked: ${r.url}]`,
    images: [],
    videos: [],
    date: new Date().toISOString().split('T')[0],
    url: r.url,
  }));
}

/**
 * DuckDuckGo HTML search (POST) — returns direct URLs, no JS, no CAPTCHA.
 * Auto-detects Chinese queries and uses Traditional Chinese locale (kl=tw-tzh).
 */
export async function searchDuckDuckGo(query: string, limit = 5): Promise<SearchResult[]> {
  try {
    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(query);
    const kl = hasChinese ? 'tw-tzh' : '';

    const res = await fetchWithTimeout('https://html.duckduckgo.com/html/', 20_000, {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': hasChinese ? 'zh-TW,zh;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(query)}&b=&kl=${kl}`,
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];

    const titleRe =
      /<a[^>]+class="result__a"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const entries: Array<{ url: string; title: string }> = [];
    for (const m of html.matchAll(titleRe)) {
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      if (!title) continue;
      try {
        if (isSkipDomain(new URL(m[1]).hostname)) continue;
      } catch { continue; }
      entries.push({ url: m[1], title });
    }
    const snippets: string[] = [];
    for (const m of html.matchAll(snippetRe)) {
      snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < Math.min(entries.length, limit); i++) {
      results.push({ ...entries[i], snippet: snippets[i] ?? '' });
    }
    return results;
  } catch {
    return [];
  }
}

/** DuckDuckGo search via Camoufox — fallback when POST is rate-limited. */
export async function searchDuckDuckGoCamoufox(query: string, limit = 5): Promise<SearchResult[]> {
  const { page, release } = await camoufoxPool.acquire();
  const results: SearchResult[] = [];
  try {
    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(query);
    const kl = hasChinese ? 'tw-tzh' : '';
    await page.goto(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${kl}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );

    const links = await page.locator('a.result__a').all();
    const snippetEls = await page.locator('a.result__snippet').all();

    for (let i = 0; i < Math.min(links.length, limit); i++) {
      try {
        const title = await links[i].innerText().catch(() => '');
        const href = await links[i].getAttribute('href').catch(() => '');
        const snippet = i < snippetEls.length
          ? await snippetEls[i].innerText().catch(() => '') : '';
        if (!title || !href) continue;

        const uddgMatch = href.match(/[?&]uddg=(https?%3A%2F%2F[^&]+)/);
        const realUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : href;
        if (!realUrl.startsWith('http')) continue;

        try {
          if (isSkipDomain(new URL(realUrl).hostname)) continue;
        } catch { continue; }

        results.push({ title, url: realUrl, snippet });
      } catch { /* skip */ }
    }
  } finally {
    await release();
  }
  return results;
}

/** Web search: DDG POST first (fast), DDG Camoufox fallback (bypasses rate limit). */
export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const ddg = await searchDuckDuckGo(query, limit);
  if (ddg.length > 0) return ddg;
  return searchDuckDuckGoCamoufox(query, limit);
}

/** Fetch full article content without external API relay; returns '' on failure. */
export async function fetchJinaContent(url: string): Promise<string> {
  try {
    const { webExtractor } = await import('../extractors/web-extractor.js');
    const content = await webExtractor.extract(url);
    return content.text.slice(0, 5000);
  } catch {
    return '';
  }
}

/* ── AI-enhanced search: query rewriting + result filtering ────────── */

/**
 * Rewrite a natural-language query into precise search keywords.
 * Falls back to the original query when oMLX is unavailable.
 */
export async function rewriteQuery(userQuery: string): Promise<{ rewritten: string; wasRewritten: boolean }> {
  if (!(await isOmlxAvailable())) {
    return { rewritten: userQuery, wasRewritten: false };
  }

  const prompt = [
    '你是搜尋關鍵字優化器。將使用者的自然語言查詢轉換為 3-5 個精準的搜尋關鍵字。',
    '規則：',
    '- 優先使用英文技術術語（搜尋引擎對英文技術詞更準確）',
    '- 移除語氣詞、疑問詞等無助搜尋的字',
    '- 保留核心意圖，用空格分隔關鍵字',
    '- 只輸出關鍵字，不要解釋',
    '',
    `使用者查詢：${userQuery}`,
    '搜尋關鍵字：',
  ].join('\n');

  const result = await omlxChatCompletion(prompt, {
    model: 'flash',
    timeoutMs: 10_000,
    temperature: 0.1,
    maxTokens: 100,
  });

  if (!result) return { rewritten: userQuery, wasRewritten: false };

  const cleaned = result.replace(/^搜尋關鍵字[：:]\s*/i, '').trim();
  if (!cleaned || cleaned.length > 200) return { rewritten: userQuery, wasRewritten: false };

  logger.info('search', 'query rewritten', { from: userQuery, to: cleaned });
  return { rewritten: cleaned, wasRewritten: true };
}

/**
 * Filter search results by relevance using LLM.
 * Falls back to returning all results when oMLX is unavailable.
 */
export async function filterRelevantResults(
  originalQuery: string,
  results: SearchResult[],
): Promise<SearchResult[]> {
  if (results.length === 0) return [];
  if (!(await isOmlxAvailable())) return results;

  const numbered = results
    .map((r, i) => `${i}. ${r.title} — ${r.snippet.slice(0, 80)}`)
    .join('\n');

  const prompt = [
    '你是搜尋結果相關性過濾器。判斷以下搜尋結果是否與使用者的查詢相關。',
    '',
    `使用者查詢：${originalQuery}`,
    '',
    '搜尋結果：',
    numbered,
    '',
    '請只輸出相關結果的編號，用逗號分隔。如果沒有相關結果，輸出 "none"。',
    '只輸出編號，不要解釋。例如：0,2,5',
  ].join('\n');

  const result = await omlxChatCompletion(prompt, {
    model: 'flash',
    timeoutMs: 10_000,
    temperature: 0.1,
    maxTokens: 50,
  });

  if (!result) return results;

  const trimmed = result.trim().toLowerCase();
  if (trimmed === 'none') {
    logger.info('search', 'all results filtered as irrelevant', { query: originalQuery });
    return [];
  }

  const indices = trimmed
    .split(/[,，\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n >= 0 && n < results.length);

  if (indices.length === 0) return results; // parsing failed, keep all

  const filtered = indices.map((i) => results[i]);
  logger.info('search', 'results filtered', {
    query: originalQuery,
    total: results.length,
    kept: filtered.length,
  });
  return filtered;
}
