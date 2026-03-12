import type { Telegraf } from 'telegraf';
import { camoufoxPool } from '../utils/camoufox-pool.js';
import type { BotStats } from '../messages/types.js';

/** @deprecated Use BotStats directly */
export type CommandStats = BotStats;

export function registerInfoCommands(bot: Telegraf, stats: CommandStats, startTime: number): void {
  bot.command('status', async (ctx) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const pool = camoufoxPool.getStats();
    const mem = process.memoryUsage();
    const lines = [
      'GetThreads Bot 狀態',
      '',
      `運行時間：${h}h ${m}m`,
      `記憶體：${Math.round(mem.rss / 1024 / 1024)} MB`,
      `Camoufox：${pool.inUse} 使用中 / ${pool.total} 總數`,
      '',
      `本次統計：處理 ${stats.urls} 個連結，儲存 ${stats.saved} 篇，失敗 ${stats.errors} 次`,
    ];

    if (stats.recent.length > 0) {
      lines.push('', `最近儲存（${stats.recent.length} 篇）：`);
      for (const item of stats.recent.slice(-5).reverse()) {
        lines.push(`• ${item}`);
      }
    }

    await ctx.reply(lines.join('\n'));
  });
}
