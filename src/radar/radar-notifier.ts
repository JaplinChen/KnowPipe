import type { Telegraf } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { getOwnerUserId } from '../utils/config.js';
import type { RadarResult } from './radar-types.js';
import { sourceLabel } from './radar-cycle-utils.js';

export async function notifyRadarResults(
  bot: Telegraf,
  config: AppConfig,
  results: RadarResult[],
): Promise<void> {
  const totalSaved = results.reduce((sum, result) => sum + result.saved, 0);
  const totalQueued = results.reduce((sum, result) => sum + result.queued, 0);
  if (totalSaved === 0 && totalQueued === 0) return;

  const userId = getOwnerUserId(config);
  if (!userId) return;

  const lines = [`🔍 內容雷達：發現 ${totalSaved} 篇新內容`, ''];
  for (const result of results) {
    if (result.saved <= 0) continue;

    const label = sourceLabel(result.query.type ?? 'search', result.query.customConfig?.name);
    const desc = result.query.type === 'rss'
      ? result.query.keywords[0]
      : result.query.type === 'custom'
        ? (result.query.customConfig?.name ?? result.query.keywords.join(' '))
        : result.query.keywords.join(' ');
    lines.push(`• [${label}] ${result.saved} 篇 — ${desc}`);
  }

  const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
  if (totalSkipped > 0) lines.push(`\n（${totalSkipped} 篇已存在，已跳過）`);
  if (totalQueued > 0) lines.push(`🎬 ${totalQueued} 部影片已排入轉錄佇列`);

  await bot.telegram.sendMessage(userId, lines.join('\n')).catch(() => {});
}

export async function notifyAutoPausedQueries(
  bot: Telegraf,
  config: AppConfig,
  maxConsecutiveFailures: number,
  newlyPaused: string[],
  promotedAuthors: string[],
  remainingAuthorQueue: number,
): Promise<void> {
  if (newlyPaused.length === 0) return;

  const userId = getOwnerUserId(config);
  if (!userId) return;

  const lines = [
    `⚠️ 以下查詢連續 ${maxConsecutiveFailures} 次無結果，已自動暫停：`,
    ...newlyPaused.map((query) => `• ${query}`),
    '',
    '使用 /radar resume <id> 可恢復。',
  ];

  if (promotedAuthors.length > 0) {
    lines.push('', '🔄 已自動輪替加入下一位備用作者：');
    promotedAuthors.forEach((handle) => lines.push(`• @${handle}`));
    if (remainingAuthorQueue > 0) lines.push(`（備用佇列剩餘 ${remainingAuthorQueue} 位）`);
  }

  await bot.telegram.sendMessage(userId, lines.join('\n')).catch(() => {});
}
