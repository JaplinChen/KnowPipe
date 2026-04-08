/**
 * /ask — Multi-step ReAct knowledge query.
 * Searches the Vault iteratively, reasons about results, generates answer.
 */
import type { Context } from 'telegraf';
import { logger } from '../core/logger.js';
import type { AppConfig } from '../utils/config.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';
import { runReActLoop } from '../utils/react-loop.js';
import { maybeGenerateSkill } from '../skills/skill-generator.js';

export async function handleAsk(ctx: Context, config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const query = text.replace(/^\/ask\s*/i, '').trim();

  if (!query) {
    await ctx.reply(
      tagForceReply('ask', '請輸入您想問的問題：'),
      forceReplyMarkup('輸入問題…'),
    );
    return;
  }

  const status = await ctx.reply('推理中…');

  try {
    const result = await runReActLoop(query, config.vaultPath);

    const searchCount = result.steps.filter((s) => s.action === 'search_vault').length;
    const header = searchCount > 0
      ? `(搜尋了 ${searchCount} 次知識庫，經過 ${result.steps.length} 步推理)\n\n`
      : '';

    await ctx.reply(header + result.answer);

    // Fire-and-forget: auto-generate reusable skill if ReAct took ≥3 steps
    maybeGenerateSkill(query, result).catch(() => {});

    logger.info('ask', 'answered', {
      steps: result.steps.length,
      queryLen: query.length,
      answerLen: result.answer.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('ask', 'failed', { message: msg });
    await ctx.reply(`查詢失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}
