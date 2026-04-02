/**
 * /memory export — Export vault knowledge as context files for other AI tools.
 * Usage:
 *   /memory export claude  — Generate CLAUDE.md context snippet
 *   /memory export cursor  — Generate .cursorrules context
 *   /memory export json    — Generate raw JSON stats
 *   /memory export all     — Export all formats
 */
import type { Context } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { exportMemory, exportAll, type ExportFormat } from '../memory/memory-exporter.js';
import { logger } from '../core/logger.js';

const VALID_FORMATS = new Set<string>(['claude', 'cursor', 'json', 'all']);

export async function handleMemoryExport(ctx: Context, config: AppConfig): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text ?? '' : '';
  const args = text.replace(/^\/memory\s*/i, '').trim().split(/\s+/);
  const sub = args[0]?.toLowerCase();

  if (sub !== 'export' || !args[1]) {
    await ctx.reply([
      '📤 記憶匯出指令：',
      '',
      '`/memory export claude` — CLAUDE.md 格式',
      '`/memory export cursor` — .cursorrules 格式',
      '`/memory export json` — JSON 統計資料',
      '`/memory export all` — 全部匯出',
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  const format = args[1].toLowerCase();
  if (!VALID_FORMATS.has(format)) {
    await ctx.reply(`❌ 不支援的格式：${format}\n可用：claude / cursor / json / all`);
    return;
  }

  const msg = await ctx.reply('📤 正在匯出 Vault 知識上下文…');

  try {
    if (format === 'all') {
      const paths = await exportAll(config.vaultPath);
      await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, undefined,
        [
          '✅ 全部匯出完成：',
          ...paths.map(p => `  📄 ${p.split('/').pop()}`),
          '',
          `路徑：${paths[0].replace(/\/[^/]+$/, '/')}`,
        ].join('\n'),
      );
    } else {
      const { path, stats } = await exportMemory(config.vaultPath, format as ExportFormat);
      await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, undefined,
        [
          `✅ 匯出完成：${path.split('/').pop()}`,
          `📊 含 ${stats.totalNotes} 篇筆記、${stats.topCategories.length} 個分類`,
          `📁 ${path}`,
        ].join('\n'),
      );
    }
  } catch (err) {
    logger.warn('memory-export', '匯出失敗', { error: (err as Error).message });
    await ctx.reply(`❌ 匯出失敗：${(err as Error).message}`);
  }
}
