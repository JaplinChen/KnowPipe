/**
 * Radar InlineKeyboard callback handlers.
 * Extracted from radar-command.ts to stay under 300 lines.
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { loadRadarConfig, saveRadarConfig, autoGenerateQueries } from '../radar/radar-store.js';
import { runRadarCycle } from '../radar/radar-service.js';
import { handleWall } from '../radar/wall-command.js';
import { logger } from '../core/logger.js';

/** Handle InlineKeyboard callbacks for radar */
export async function handleRadarAction(ctx: Context, action: string, config: AppConfig): Promise<void> {
  const radarConfig = await loadRadarConfig();

  if (action === 'toggle') {
    radarConfig.enabled = !radarConfig.enabled;
    await saveRadarConfig(radarConfig);
    await ctx.reply(radarConfig.enabled ? '✅ 雷達已啟用' : '⏸️ 雷達已停用');
    return;
  }

  if (action === 'auto') {
    await ctx.reply('🤖 正在自動生成查詢...');
    const added = await autoGenerateQueries(config.vaultPath, radarConfig);
    await saveRadarConfig(radarConfig);
    const lines = added.map(q => `• ${q.keywords.join(' ')}`);
    await ctx.reply(`已生成 ${added.length} 個查詢\n${lines.join('\n')}`);
    return;
  }

  if (action === 'wall') {
    await handleWall(ctx, config, '');
    return;
  }

  if (action === 'usage') {
    await ctx.reply(
      '用法:\n' +
      '/radar — 查看狀態\n' +
      '/radar on|off — 啟用/停用\n' +
      '/radar add <關鍵字> — 新增搜尋查詢（DDG）\n' +
      '/radar add hn|reddit|devto|github|rss — 新增來源\n' +
      '/radar remove <id> — 移除查詢\n' +
      '/radar resume <id> — 恢復暫停的查詢\n' +
      '/radar auto — 從 Vault 自動生成\n' +
      '/radar run — 立即執行\n' +
      '/radar wall — 工具情報牆',
    );
    return;
  }

  if (action === 'addsrc') {
    await ctx.reply(
      '選擇要新增的來源類型：',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🔍 DDG 搜尋', 'radar:help:search'),
          Markup.button.callback('🟠 HN', 'radar:help:hn'),
        ],
        [
          Markup.button.callback('🔴 Reddit', 'radar:help:reddit'),
          Markup.button.callback('📝 Dev.to', 'radar:help:devto'),
        ],
        [
          Markup.button.callback('🐙 GitHub', 'radar:help:github'),
          Markup.button.callback('📡 RSS', 'radar:help:rss'),
        ],
      ]),
    );
    return;
  }

  if (action.startsWith('help:')) {
    const srcType = action.slice(5);
    const hints: Record<string, string> = {
      search: '/radar add AI agent framework',
      hn: '/radar add hn\n（抓取 HN 熱門文章）',
      reddit: '/radar add reddit MachineLearning LocalLLaMA',
      devto: '/radar add devto ai typescript webdev',
      github: '/radar add github typescript',
      rss: '/radar add rss https://example.com/feed.xml',
    };
    await ctx.reply(`輸入指令新增：\n\n${hints[srcType] ?? '/radar add <關鍵字>'}`);
    return;
  }

  if (action === 'run') {
    if (radarConfig.queries.length === 0) {
      await ctx.reply('❌ 沒有查詢，請先自動生成');
      return;
    }
    await ctx.reply(`🔍 開始掃描...`);
    const results = await runRadarCycle(ctx as never, config, radarConfig);
    const saved = results.reduce((s, r) => s + r.saved, 0);
    if (saved === 0) {
      await ctx.reply('📭 沒有發現新內容');
    }
    return;
  }

  logger.warn('radar', '未知 action', { action });
}
