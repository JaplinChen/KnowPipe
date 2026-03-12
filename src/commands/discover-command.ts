/**
 * /discover — Proactive content discovery across platforms.
 * Searches GitHub trending repos by user interests, presents candidates.
 * User sends back URLs to process through the standard pipeline.
 */
import { execFile } from 'node:child_process';
import type { Context } from 'telegraf';
import { logger } from '../core/logger.js';
import type { AppConfig } from '../utils/config.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';

const DEFAULT_TOPICS = ['ai-agent', 'obsidian', 'cli-tool'];
const MAX_RESULTS = 8;

interface GhRepo {
  fullName: string;
  description: string;
  stargazersCount: number;
  language: string;
  htmlUrl: string;
  updatedAt: string;
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

/* ── Format results ──────────────────────────────────────────────────── */

function formatResults(repos: GhRepo[], query: string): string {
  if (repos.length === 0) return `找不到與「${query}」相關的專案。`;

  const lines = [`GitHub 搜尋結果：「${query}」\n`];
  for (let i = 0; i < repos.length; i++) {
    const r = repos[i];
    const stars = r.stargazersCount >= 1000
      ? `${(r.stargazersCount / 1000).toFixed(1)}k`
      : String(r.stargazersCount);
    const lang = r.language ? ` [${r.language}]` : '';
    const desc = r.description.slice(0, 60) || '(no description)';
    lines.push(`${i + 1}. ${r.fullName}${lang} (${stars} stars)`);
    lines.push(`   ${desc}`);
    lines.push(`   ${r.htmlUrl}`);
    lines.push('');
  }
  lines.push('傳送連結即可存入 Vault。');
  return lines.join('\n');
}

/* ── Command handler ─────────────────────────────────────────────────── */

export async function handleDiscover(ctx: Context, config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const rawQuery = text.replace(/^\/discover\s*/i, '').trim();

  if (!rawQuery) {
    await ctx.reply(
      tagForceReply('discover', '輸入搜尋關鍵字（如：ai-agent、obsidian-plugin）：'),
      forceReplyMarkup('搜尋關鍵字…'),
    );
    return;
  }

  const status = await ctx.reply(`搜尋 GitHub…`);

  try {
    // Build search query
    const query = rawQuery.includes(' stars:')
      ? rawQuery
      : `${rawQuery} stars:>50`;

    const repos = await searchGitHub(query, MAX_RESULTS);
    const result = formatResults(repos, rawQuery);

    await ctx.reply(result, { disable_web_page_preview: true } as object);
    logger.info('discover', 'searched', { query: rawQuery, found: repos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('discover', 'failed', { message: msg });
    await ctx.reply(`搜尋失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}

/** Batch discover using default interest topics. */
export async function handleDiscoverTrending(ctx: Context, _config: AppConfig): Promise<void> {
  const status = await ctx.reply('掃描熱門專案中…');

  try {
    const allResults: string[] = [`每日探索：你的關注領域\n`];

    for (const topic of DEFAULT_TOPICS) {
      const repos = await searchGitHub(
        `topic:${topic} stars:>100 pushed:>${getDateDaysAgo(7)}`,
        3,
      );
      if (repos.length > 0) {
        allResults.push(`--- ${topic} ---`);
        for (const r of repos) {
          const stars = r.stargazersCount >= 1000
            ? `${(r.stargazersCount / 1000).toFixed(1)}k`
            : String(r.stargazersCount);
          allResults.push(`${r.fullName} (${stars}) ${r.htmlUrl}`);
        }
        allResults.push('');
      }
    }

    allResults.push('傳送連結即可存入 Vault。');
    await ctx.reply(allResults.join('\n'), { disable_web_page_preview: true } as object);
    logger.info('discover', 'trending-scan', { topics: DEFAULT_TOPICS.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`掃描失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
