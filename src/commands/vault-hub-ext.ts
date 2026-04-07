/**
 * vault-hub-ext — extended /vault subcommand handlers.
 * Imported by vault-hub.ts to keep that file under 300 lines.
 * Covers: graph, dreaming, memoir, analyze rules, bookmark-gap.
 */
import type { Context } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { startTyping, stopTyping } from '../utils/typing-indicator.js';
import { splitMessage } from '../utils/telegram.js';
import { loadKnowledge } from '../knowledge/knowledge-store.js';
import { formatGraph } from '../knowledge/knowledge-graph.js';
import { runDreaming } from '../knowledge/dreaming-engine.js';
import { generateMemoir } from '../knowledge/memoir-generator.js';
import { runRulesSuggester } from '../knowledge/rules-suggester.js';
import { analyzeBookmarkGaps } from '../knowledge/bookmark-analyzer.js';

/** /vault graph [--topic <kw>] [--top N] */
export async function handleVaultGraph(ctx: Context, config: AppConfig, args: string): Promise<void> {
  const topMatch = args.match(/--top\s+(\d+)/);
  const topN = topMatch ? parseInt(topMatch[1], 10) : 20;
  const topicMatch = args.match(/--topic\s+(\S+)/);
  const cleanArgs = args.replace(/--top\s+\d+|--topic\s+\S+/g, '').trim();
  const filterTopic = topicMatch?.[1] ?? (cleanArgs || undefined);

  const typing = startTyping(ctx);
  try {
    const knowledge = await loadKnowledge();
    if (Object.keys(knowledge.notes).length === 0) {
      stopTyping(typing);
      await ctx.reply('知識庫尚未建立，請先執行 /vault analyze 建立實體圖譜。');
      return;
    }
    const output = formatGraph(knowledge, topN, filterTopic);
    stopTyping(typing);
    for (const chunk of splitMessage(output)) await ctx.reply(chunk);
  } catch (err) {
    stopTyping(typing);
    await ctx.reply(`知識圖譜失敗：${String(err)}`);
  }
}

/** /vault dreaming [--days N] [--apply] */
export async function handleVaultDreaming(ctx: Context, config: AppConfig, args: string): Promise<void> {
  const daysMatch = args.match(/--days\s+(\d+)/);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
  const apply = args.includes('--apply');

  const typing = startTyping(ctx);
  await ctx.reply(`🌙 正在執行 dreaming（最近 ${days} 天${apply ? '，套用模式' : '，dry-run'}）…`);

  try {
    const result = await runDreaming(config.vaultPath, days, !apply);
    stopTyping(typing);
    const lines = [
      `✅ Dreaming 完成`,
      `掃描筆記：${result.scannedNotes} 篇`,
      `發現連結：${result.notesWithLinks} 篇，${result.totalNewLinks} 條新關聯`,
      apply ? '已套用 related: 欄位' : '（dry-run，未修改筆記）',
    ];
    if (result.savedPath) lines.push(`報告：${result.savedPath.split('/').slice(-3).join('/')}`);
    await ctx.reply(lines.join('\n'));
  } catch (err) {
    stopTyping(typing);
    await ctx.reply(`Dreaming 失敗：${String(err)}`);
  }
}

/** /vault memoir [--since YYYY-MM-DD] */
export async function handleVaultMemoir(ctx: Context, config: AppConfig, args: string): Promise<void> {
  const sinceMatch = args.match(/--since\s+(\d{4}-\d{2}-\d{2})/);
  const since = sinceMatch?.[1];

  const typing = startTyping(ctx);
  await ctx.reply(`📖 正在生成 ObsBot 開發史${since ? ` (${since} 起)` : ''}…`);

  try {
    const result = await generateMemoir(config.vaultPath, since);
    stopTyping(typing);
    await ctx.reply([
      `✅ 開發史生成完成`,
      `提交記錄：${result.commitCount} 筆`,
      `記憶脈絡：${result.hasMemory ? '已載入' : '未找到'}`,
      `報告：${result.savedPath.split('/').slice(-3).join('/')}`,
    ].join('\n'));
  } catch (err) {
    stopTyping(typing);
    await ctx.reply(`開發史生成失敗：${String(err)}`);
  }
}

/** /vault analyze rules */
export async function handleVaultAnalyzeRules(ctx: Context, config: AppConfig, _args: string): Promise<void> {
  const typing = startTyping(ctx);
  await ctx.reply('🔍 正在分析 Vault 決策筆記，比對 CLAUDE.md…');

  try {
    const result = await runRulesSuggester(config.vaultPath);
    stopTyping(typing);
    await ctx.reply([
      `✅ 規則建議完成`,
      `分析筆記：${result.relevantNotes} 篇`,
      `建議條目：${result.suggestionsCount} 條`,
      `報告：${result.savedPath.split('/').slice(-3).join('/')}`,
      '',
      '⚠️ 以上為建議，需手動確認後才套用至 CLAUDE.md',
    ].join('\n'));
  } catch (err) {
    stopTyping(typing);
    await ctx.reply(`規則建議失敗：${String(err)}`);
  }
}

/** /vault bookmark-gap */
export async function handleVaultBookmarkGap(ctx: Context, config: AppConfig, _args: string): Promise<void> {
  const typing = startTyping(ctx);
  await ctx.reply('🔖 正在分析 X 書籤知識缺口…');

  try {
    const result = await analyzeBookmarkGaps(config.vaultPath);
    stopTyping(typing);
    if (result.error) {
      await ctx.reply(`⚠️ ${result.error}\n\n報告已存入 Vault，包含安裝說明。`);
      return;
    }
    await ctx.reply([
      `✅ 書籤分析完成`,
      `書籤總數：${result.bookmarkCount} 條`,
      `知識缺口：${result.gapCount} 個主題`,
      result.savedPath ? `報告：${result.savedPath.split('/').slice(-3).join('/')}` : '',
    ].filter(Boolean).join('\n'));
  } catch (err) {
    stopTyping(typing);
    await ctx.reply(`書籤分析失敗：${String(err)}`);
  }
}
