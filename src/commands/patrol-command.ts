/**
 * /patrol — manual trigger for content patrol + auto toggle.
 * /patrol       → run one patrol cycle now
 * /patrol auto  → toggle automatic patrol on/off
 */
import type { Context } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { runPatrolCycle } from '../patrol/patrol-service.js';
import { loadPatrolConfig, savePatrolConfig } from '../patrol/patrol-store.js';

export async function handlePatrol(ctx: Context, config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const arg = text.replace(/^\/patrol\s*/i, '').trim().toLowerCase();

  // Toggle auto mode
  if (arg === 'auto') {
    const pConfig = await loadPatrolConfig();
    pConfig.enabled = !pConfig.enabled;
    await savePatrolConfig(pConfig);
    await ctx.reply(
      pConfig.enabled
        ? `✅ 自動巡邏已啟用（每 ${pConfig.intervalHours} 小時）`
        : '⏸️ 自動巡邏已停用',
    );
    return;
  }

  // Manual run
  const status = await ctx.reply('🔭 正在巡邏 GitHub Trending...');

  try {
    const pConfig = await loadPatrolConfig();
    const result = await runPatrolCycle(config, pConfig.languages);

    pConfig.lastPatrolAt = new Date().toISOString();
    await savePatrolConfig(pConfig);

    const lines = [
      '🔭 巡邏完成：GitHub Trending',
      '',
      `找到 ${result.found} 個專案`,
      `✅ 新儲存 ${result.saved} 篇`,
      `⏭️ 跳過 ${result.skipped} 篇（已存在或擷取失敗）`,
      '',
      '提示：使用 /patrol auto 啟用定時巡邏',
    ];
    await ctx.reply(lines.join('\n'));
  } catch (err) {
    await ctx.reply(`巡邏失敗：${(err as Error).message}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}
