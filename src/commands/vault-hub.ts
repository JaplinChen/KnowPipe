/**
 * /vault — unified Vault maintenance entry point.
 * Consolidates quality, dedup, reprocess, reformat, benchmark, retry, suggest.
 * Old commands remain registered for backward compatibility.
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { handleQuality } from './quality-command.js';
import { handleDedup } from './dedup-command.js';
import { handleReprocess } from './reprocess-command.js';
import { handleReformat } from './reformat-command.js';
import { handleBenchmark } from './benchmark-command.js';
import { handleSuggest } from './suggest-command.js';
import type { BotStats } from '../messages/types.js';

type SubHandler = (ctx: Context, config: AppConfig) => Promise<void>;

const MODES: Record<string, { handler: SubHandler; prefix: string }> = {
  quality: { handler: handleQuality, prefix: '/quality' },
  dedup: { handler: handleDedup, prefix: '/dedup' },
  reprocess: { handler: handleReprocess, prefix: '/reprocess' },
  reformat: { handler: handleReformat, prefix: '/reformat' },
  benchmark: { handler: handleBenchmark, prefix: '/benchmark' },
  suggest: { handler: handleSuggest, prefix: '/suggest' },
};

function rewriteText(ctx: Context, newCommand: string, args: string): void {
  const msg = ctx.message as unknown as Record<string, unknown> | undefined;
  const text = args ? `${newCommand} ${args}` : newCommand;
  if (msg) { msg.text = text; }
  else { (ctx as unknown as Record<string, unknown>).message = { text }; }
}

/** Build vault hub with retry handler injected at registration time */
export function createVaultHub(stats: BotStats) {
  return async function handleVaultHub(ctx: Context, config: AppConfig): Promise<void> {
    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
    const parts = text.replace(/^\/vault\s*/i, '').trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase() ?? '';
    const rest = parts.slice(1).join(' ');

    // retry needs special handling (uses stats closure)
    if (sub === 'retry') {
      const { createRetryHandler } = await import('./retry-command.js');
      const handler = createRetryHandler(stats);
      rewriteText(ctx, '/retry', rest);
      await handler(ctx, config);
      return;
    }

    const mode = MODES[sub];
    if (mode) {
      rewriteText(ctx, mode.prefix, rest);
      await mode.handler(ctx, config);
      return;
    }

    // No args → show menu
    await ctx.reply(
      [
        '🔧 Vault 維護',
        '',
        '📊 品質報告 — 掃描筆記品質問題',
        '🔍 重複掃描 — 找出重複筆記',
        '🔄 重新處理 — AI 豐富筆記內容',
        '📐 修復排版 — 修正格式問題',
        '📈 品質基準 — 評分趨勢分析',
        '🔁 重試失敗 — 重試失敗連結',
        '🔗 推薦連結 — 發現相關筆記',
      ].join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 品質報告', 'vlt:quality'),
          Markup.button.callback('🔍 重複掃描', 'vlt:dedup'),
        ],
        [
          Markup.button.callback('🔄 重新處理', 'vlt:reprocess'),
          Markup.button.callback('📐 修復排版', 'vlt:reformat'),
        ],
        [
          Markup.button.callback('📈 品質基準', 'vlt:benchmark'),
          Markup.button.callback('🔁 重試失敗', 'vlt:retry'),
        ],
        [Markup.button.callback('🔗 推薦連結', 'vlt:suggest')],
      ]),
    );
  };
}

/** Handle vlt:* callbacks from InlineKeyboard */
export function createVaultCallback(stats: BotStats) {
  return async function handleVaultCallback(ctx: Context & { match: RegExpExecArray }, config: AppConfig): Promise<void> {
    const mode = ctx.match[1];
    await ctx.answerCbQuery().catch(() => {});

    if (mode === 'retry') {
      const { createRetryHandler } = await import('./retry-command.js');
      const handler = createRetryHandler(stats);
      rewriteText(ctx, '/retry', '');
      await handler(ctx, config);
      return;
    }

    const m = MODES[mode];
    if (m) {
      rewriteText(ctx, m.prefix, '');
      await m.handler(ctx, config);
    }
  };
}
