/**
 * Radar InlineKeyboard callback handlers.
 * Extracted from radar-command.ts to stay under 300 lines.
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { loadRadarConfig, saveRadarConfig, autoGenerateQueries, addQuery } from '../radar/radar-store.js';
import { addAuthorQuery } from '../radar/radar-author.js';
import { runRadarCycle } from '../radar/radar-service.js';
import { handleWall } from '../radar/wall-command.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';
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
      '選擇要新增的追蹤類型：',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🏷 主題', 'radar:addsrc:topic'),
          Markup.button.callback('👤 作者', 'radar:addsrc:author'),
          Markup.button.callback('🔑 關鍵字', 'radar:addsrc:keyword'),
        ],
        [
          Markup.button.callback('📡 RSS', 'radar:addsrc:rss'),
          Markup.button.callback('🔌 自訂 API', 'radar:addsrc:custom'),
        ],
      ]),
    );
    return;
  }

  if (action.startsWith('addsrc:')) {
    const srcType = action.slice(7);
    if (srcType === 'topic') {
      await ctx.reply(
        tagForceReply('radar-keyword', '輸入主題關鍵字（例：AI agents）：'),
        forceReplyMarkup('主題…'),
      );
    } else if (srcType === 'author') {
      await ctx.reply(
        tagForceReply('radar-author', '輸入作者名稱或 handle（例：karpathy）：'),
        forceReplyMarkup('作者名稱…'),
      );
    } else if (srcType === 'keyword') {
      await ctx.reply(
        tagForceReply('radar-keyword', '輸入監控關鍵字（例：LLM fine-tuning）：'),
        forceReplyMarkup('關鍵字…'),
      );
    } else if (srcType === 'rss') {
      await ctx.reply('新增 RSS 來源：\n\n/radar add rss https://example.com/feed.xml');
    } else if (srcType === 'custom') {
      await ctx.reply(
        '新增自訂 JSON API 來源：\n\n' +
        '/radar add custom <名稱> <url> <itemsPath> <urlField> <titleField>\n\n' +
        '• url 支援 {query} 佔位符\n' +
        '• 例：/radar add custom "AI News" "https://api.example.com/search?q={query}" "results" "link" "title"',
      );
    }
    return;
  }

  // Legacy help: hints (backward compat)
  if (action.startsWith('help:')) {
    const srcType = action.slice(5);
    const hints: Record<string, string> = {
      search: '/radar add AI agent framework',
      hn: '/radar add hn',
      reddit: '/radar add reddit MachineLearning',
      devto: '/radar add devto ai typescript',
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

/** ForceReply handler: add keyword/topic query to radar */
export async function handleRadarAddKeyword(ctx: Context, config: AppConfig): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const keyword = text.replace(/^\/radar-keyword\s*/i, '').trim();
  if (!keyword) { await ctx.reply('關鍵字不能為空。'); return; }

  const radarConfig = await loadRadarConfig();
  const keywords = keyword.split(/\s+/);
  const query = addQuery(radarConfig, keywords, 'manual', 'search');
  await saveRadarConfig(radarConfig);
  await ctx.reply(`✅ 已新增關鍵字監控 [${query.id}]：${keywords.join(' ')}`);
}

/** ForceReply handler: add author tracking query to radar */
export async function handleRadarAddAuthor(ctx: Context, config: AppConfig): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const handle = text.replace(/^\/radar-author\s*/i, '').replace(/^@/, '').trim();
  if (!handle) { await ctx.reply('作者名稱不能為空。'); return; }

  const radarConfig = await loadRadarConfig();
  addAuthorQuery(radarConfig, handle);
  await saveRadarConfig(radarConfig);
  await ctx.reply(`✅ 已新增作者追蹤：${handle}\n雷達將定期搜尋其文章並存入 Vault。`);
}
