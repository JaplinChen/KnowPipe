/**
 * Centralised command registration — extracted from bot.ts to stay under 300 lines.
 * All bot.command() calls live here; bot.ts keeps only the core skeleton.
 */
import type { Context, Telegraf } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { executeLearn, formatLearnReport } from '../learning/learn-command.js';
import { executeReclassify } from '../learning/reclassify-command.js';
import { executeBatchTranslate } from '../learning/batch-translator.js';
import { handleTimeline } from './timeline-command.js';
import { handleMonitor, handleSearch } from './monitor-command.js';
import { handleAnalyze, handleKnowledge, handleGaps, handleSkills } from './knowledge-command.js';
import {
  handleRecommend,
  handleBrief,
  handleCompare,
  handleRecommendByTopic,
  handleBriefByTopic,
  handleCompareByArg,
  resolveCallbackPayload,
} from './knowledge-query-command.js';
import { runCommandTask } from './command-runner.js';
import { formatErrorMessage } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { camoufoxPool } from '../utils/camoufox-pool.js';

export { formatErrorMessage };

type MatchedContext = Context & { match: RegExpExecArray };

function registerAsyncCommand(
  bot: Telegraf,
  command: string | readonly string[],
  tag: string,
  config: AppConfig,
  handler: (ctx: Context, config: AppConfig) => Promise<void>,
): void {
  bot.command(command as string | string[], (ctx) => {
    runCommandTask(ctx, tag, () => handler(ctx, config), formatErrorMessage).catch(() => {});
  });
}

function registerAsyncAction(
  bot: Telegraf,
  pattern: RegExp,
  tag: string,
  handler: (ctx: MatchedContext) => Promise<void>,
): void {
  bot.action(pattern, (ctx) => {
    const matchedCtx = ctx as MatchedContext;
    runCommandTask(matchedCtx, tag, () => handler(matchedCtx), formatErrorMessage).catch(() => {});
  });
}

export function registerCommands(
  bot: Telegraf,
  config: AppConfig,
  stats: { urls: number; saved: number; errors: number; recent: string[] },
  startTime: number,
): void {
  const helpText = [
    'GetThreads Bot',
    '',
    '傳送連結即可自動儲存內容與評論：',
    'X / Threads / Reddit / YouTube / GitHub',
    '微博 / B站 / 小紅書 / 抖音 / 任何網頁',
    '',
    '指令：',
    '/search <查詢> — 網頁搜尋',
    '/monitor <關鍵字> — 跨平台搜尋提及',
    '/timeline @用戶 — 抓取用戶最近貼文',
    '/analyze — 深度分析 Vault 知識',
    '/knowledge — 查看知識庫摘要',
    '/recommend <主題> — 推薦相關筆記',
    '/brief <主題> — 主題知識簡報',
    '/compare <A> vs <B> — 實體對比',
    '/gaps — 知識缺口分析',
    '/skills — 高密度主題 Skill 建議',
    '/recent — 本次啟動已儲存的內容',
    '/status — Bot 運行狀態',
    '/learn — 重新掃描 Vault 更新分類',
    '/reclassify — 重新分類所有筆記',
    '/translate — 批次翻譯英文/簡中筆記',
    '/help — 顯示此說明',
  ].join('\n');

  bot.start((ctx) => ctx.reply(helpText));
  bot.command('help', (ctx) => ctx.reply(helpText));

  // --- Learning & Classification ---
  bot.command('learn', (ctx) => {
    ctx.reply('開始掃描 vault，完成後會通知你。').catch(() => {});
    executeLearn(config)
      .then((result) => ctx.reply(formatLearnReport(result)).catch(() => {}))
      .catch((err) => ctx.reply(formatErrorMessage(err)).catch(() => {}));
  });

  bot.command('reclassify', (ctx) => {
    ctx.reply('開始重新分類筆記，完成後會通知你。').catch(() => {});
    executeReclassify(config)
      .then((result) => {
        const lines = [`重新分類完成：${result.total} 篇筆記`, `搬移：${result.moved} 篇`];
        if (result.changes.length > 0) {
          lines.push('', '異動清單：');
          for (const c of result.changes.slice(0, 10)) {
            lines.push(`• ${c.from} → ${c.to}: ${c.file}`);
          }
          if (result.changes.length > 10) lines.push(`...等共 ${result.changes.length} 篇`);
        }
        ctx.reply(lines.join('\n')).catch(() => {});
      })
      .catch((err) => ctx.reply(formatErrorMessage(err)).catch(() => {}));
  });

  bot.command('translate', (ctx) => {
    ctx.reply('開始批次翻譯筆記，完成後會通知你。').catch(() => {});
    executeBatchTranslate(config)
      .then((r) => {
        const lines = [
          `批次翻譯完成：掃描 ${r.total} 篇`,
          `✅${r.translated} ⏭${r.skipped} 🈚${r.noNeed} ❌${r.failed}`,
        ];
        for (const d of r.details.slice(0, 15)) {
          lines.push(`• [${d.lang}] ${d.file.slice(0, 40)} ${d.status}`);
        }
        if (r.details.length > 15) lines.push(`...等共 ${r.details.length} 篇`);
        ctx.reply(lines.join('\n')).catch(() => {});
      })
      .catch((err) => ctx.reply(formatErrorMessage(err)).catch(() => {}));
  });

  // --- Camoufox-based commands ---
  registerAsyncCommand(bot, 'timeline', 'timeline', config, handleTimeline);
  registerAsyncCommand(bot, 'monitor', 'monitor', config, handleMonitor);
  registerAsyncCommand(bot, ['search', 'google'], 'search', config, handleSearch);

  // --- Knowledge system ---
  registerAsyncCommand(bot, 'analyze', 'analyze', config, handleAnalyze);
  registerAsyncCommand(bot, 'knowledge', 'knowledge', config, handleKnowledge);
  registerAsyncCommand(bot, 'recommend', 'recommend', config, handleRecommend);
  registerAsyncCommand(bot, 'brief', 'brief', config, handleBrief);
  registerAsyncCommand(bot, 'compare', 'compare', config, handleCompare);
  registerAsyncCommand(bot, 'gaps', 'gaps', config, handleGaps);
  registerAsyncCommand(bot, 'skills', 'skills', config, handleSkills);

  // --- InlineKeyboard callback handlers ---
  registerAsyncAction(bot, /^(recommend|brief):(.+)$/, 'knowledge-action', async (ctx) => {
    const [, cmd, rawTopic] = ctx.match!;
    const topic = resolveCallbackPayload(cmd, rawTopic);
    await ctx.answerCbQuery().catch(() => {});
    const handler = cmd === 'recommend' ? handleRecommendByTopic : handleBriefByTopic;
    await handler(ctx, topic);
  });

  registerAsyncAction(bot, /^compare:(.+)$/, 'compare-action', async (ctx) => {
    const rawArg = ctx.match![1];
    const arg = resolveCallbackPayload('compare', rawArg);
    await ctx.answerCbQuery().catch(() => {});
    await handleCompareByArg(ctx, arg);
  });

  // --- Info commands ---
  bot.command('status', async (ctx) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const pool = camoufoxPool.getStats();
    const mem = process.memoryUsage();
    await ctx.reply(
      [
        'GetThreads Bot 狀態',
        '',
        `運行時間：${h}h ${m}m`,
        `記憶體：${Math.round(mem.rss / 1024 / 1024)} MB`,
        `Camoufox：${pool.inUse} 使用中 / ${pool.total} 總數`,
        '',
        `本次統計：處理 ${stats.urls} 個連結，儲存 ${stats.saved} 篇，失敗 ${stats.errors} 次`,
      ].join('\n'),
    );
  });

  bot.command('recent', async (ctx) => {
    if (stats.recent.length === 0) {
      await ctx.reply('本次啟動尚未儲存任何內容。');
      return;
    }
    const lines = [`本次已儲存 ${stats.saved} 篇：`, ''];
    for (const item of stats.recent.slice(-10).reverse()) {
      lines.push(`• ${item}`);
    }
    await ctx.reply(lines.join('\n'));
  });

  // --- Register command menu ---
  bot.telegram
    .setMyCommands([
      { command: 'start', description: '顯示 Bot 說明' },
      { command: 'search', description: '網頁搜尋' },
      { command: 'monitor', description: '跨平台搜尋提及' },
      { command: 'timeline', description: '抓取用戶最近貼文' },
      { command: 'analyze', description: '深度分析 Vault 知識' },
      { command: 'knowledge', description: '查看知識庫摘要' },
      { command: 'recommend', description: '推薦相關筆記' },
      { command: 'brief', description: '主題知識簡報' },
      { command: 'compare', description: '實體對比' },
      { command: 'gaps', description: '知識缺口分析' },
      { command: 'skills', description: '高密度主題 Skill 建議' },
      { command: 'recent', description: '本次已儲存的內容' },
      { command: 'status', description: 'Bot 運行狀態' },
      { command: 'learn', description: '重新掃描 Vault 更新分類' },
      { command: 'reclassify', description: '重新分類所有筆記' },
      { command: 'translate', description: '批次翻譯英文/簡中筆記' },
      { command: 'help', description: '顯示說明' },
    ])
    .catch((err) => logger.warn('bot', 'setMyCommands failed', err));
}
