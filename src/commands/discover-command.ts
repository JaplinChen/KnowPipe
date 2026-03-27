/**
 * /discover — Proactive content discovery across platforms.
 * /discover <keyword> — search GitHub repos by keyword.
 * /discover (no args) — scan trending repos in default interest areas.
 * Each result includes a "📥 存入" inline button to save directly to Vault.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { logger } from '../core/logger.js';
import type { AppConfig } from '../utils/config.js';

const DEFAULT_TOPICS = ['ai-agent', 'obsidian', 'cli-tool'];
const MAX_RESULTS = 8;
const URL_CACHE_LIMIT = 200;

interface GhRepo {
  fullName: string;
  description: string;
  stargazersCount: number;
  language: string;
  htmlUrl: string;
  updatedAt: string;
}

/* ── URL token cache (maps short hash → full URL) ──────────────────── */

const urlTokenCache = new Map<string, string>();

export function rememberUrl(url: string): string {
  const token = createHash('sha1').update(url).digest('hex').slice(0, 12);
  urlTokenCache.set(token, url);

  if (urlTokenCache.size > URL_CACHE_LIMIT) {
    const oldest = urlTokenCache.keys().next().value;
    if (oldest) urlTokenCache.delete(oldest);
  }
  return token;
}

/** Resolve a discover callback token back to a URL */
export function resolveDiscoverToken(token: string): string | null {
  return urlTokenCache.get(token) ?? null;
}

/* ── GitHub search via gh CLI ────────────────────────────────────────── */

async function searchGitHub(query: string, limit: number): Promise<GhRepo[]> {
  return new Promise((resolve) => {
    const args = [
      'search', 'repos', query,
      '--sort', 'stars',
      '--order', 'desc',
      '--limit', String(limit),
      '--json', 'fullName,description,stargazersCount,language,url,updatedAt',
    ];

    execFile('gh', args, { timeout: 15_000 }, (err, stdout) => {
      if (err || !stdout) { resolve([]); return; }
      try {
        const raw = JSON.parse(stdout) as Array<{
          fullName: string;
          description: string;
          stargazersCount: number;
          language: string;
          url: string;
          updatedAt: string;
        }>;
        resolve(raw.map((r) => ({
          fullName: r.fullName,
          description: r.description ?? '',
          stargazersCount: r.stargazersCount,
          language: r.language ?? '',
          htmlUrl: r.url,
          updatedAt: r.updatedAt,
        })));
      } catch {
        resolve([]);
      }
    });
  });
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatStars(count: number): string {
  return count >= 1000
    ? `${(count / 1000).toFixed(1)}k`
    : String(count);
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Build inline keyboard with one save button per repo (2 per row) */
function buildSaveButtons(repos: GhRepo[]) {
  const buttons = repos.map((r) => {
    const token = rememberUrl(r.htmlUrl);
    const shortName = r.fullName.split('/')[1] ?? r.fullName;
    return Markup.button.callback(
      `📥 ${shortName}`,
      `dsc:${token}`,
    );
  });

  // 2 buttons per row
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
}

/* ── Format results ──────────────────────────────────────────────────── */

function formatSearchResults(repos: GhRepo[], query: string): string {
  if (repos.length === 0) return `找不到與「${query}」相關的專案。`;

  const lines = [`GitHub 搜尋結果：「${query}」\n`];
  for (const r of repos) {
    const lang = r.language ? ` [${r.language}]` : '';
    const desc = r.description.slice(0, 60) || '(no description)';
    lines.push(`${r.fullName}${lang} (${formatStars(r.stargazersCount)})`);
    lines.push(`  ${desc}`);
    lines.push(`  ${r.htmlUrl}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatTrendingResults(topicRepos: Array<{ topic: string; repos: GhRepo[] }>): string {
  const lines = [`每日探索：你的關注領域\n`];

  for (const { topic, repos } of topicRepos) {
    if (repos.length === 0) continue;
    lines.push(`--- ${topic} ---`);
    for (const r of repos) {
      lines.push(`${r.fullName} (${formatStars(r.stargazersCount)}) ${r.htmlUrl}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/* ── Command handler ─────────────────────────────────────────────────── */

/** /discover <keyword> — search; /discover (no args) — trending */
export async function handleDiscover(ctx: Context, _config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const rawQuery = text.replace(/^\/discover\s*/i, '').trim();

  if (!rawQuery) {
    await runTrending(ctx);
    return;
  }

  const status = await ctx.reply(`搜尋 GitHub…`);

  try {
    const query = rawQuery.includes(' stars:')
      ? rawQuery
      : `${rawQuery} stars:>50`;

    const repos = await searchGitHub(query, MAX_RESULTS);
    const message = formatSearchResults(repos, rawQuery);

    if (repos.length > 0) {
      await ctx.reply(message, {
        disable_web_page_preview: true,
        ...buildSaveButtons(repos),
      } as object);
    } else {
      await ctx.reply(message);
    }
    logger.info('discover', 'searched', { query: rawQuery, found: repos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('discover', 'failed', { message: msg });
    await ctx.reply(`搜尋失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}

/** Scan trending repos in default interest areas */
async function runTrending(ctx: Context): Promise<void> {
  const status = await ctx.reply('掃描熱門專案中…');

  try {
    const topicRepos: Array<{ topic: string; repos: GhRepo[] }> = [];
    const allRepos: GhRepo[] = [];

    for (const topic of DEFAULT_TOPICS) {
      const repos = await searchGitHub(
        `topic:${topic} stars:>100 pushed:>${getDateDaysAgo(7)}`,
        3,
      );
      topicRepos.push({ topic, repos });
      allRepos.push(...repos);
    }

    const message = formatTrendingResults(topicRepos);

    if (allRepos.length > 0) {
      await ctx.reply(message, {
        disable_web_page_preview: true,
        ...buildSaveButtons(allRepos),
      } as object);
    } else {
      await ctx.reply(message);
    }
    logger.info('discover', 'trending-scan', { topics: DEFAULT_TOPICS.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`掃描失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}
