/**
 * /subscribe — Subscribe to authors for automatic new content checking.
 * /subscribe @username      → add subscription (Threads only for now)
 * /subscribe list           → show all subscriptions
 * /subscribe remove @user   → remove subscription
 */
import type { Context } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { logger } from '../core/logger.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';
import {
  loadSubscriptions,
  saveSubscriptions,
  addSubscription,
  removeSubscription,
} from '../subscriptions/subscription-store.js';

export async function handleSubscribe(ctx: Context, config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/subscribe\s*/, '').trim();

  if (!args) {
    await ctx.reply(
      tagForceReply('subscribe', '請輸入操作：\n• @username — 訂閱用戶\n• list — 查看訂閱清單\n• remove @username — 取消訂閱'),
      forceReplyMarkup('@username 或 list…'),
    );
    return;
  }

  const store = await loadSubscriptions();

  // --- List ---
  if (args.toLowerCase() === 'list') {
    if (store.subscriptions.length === 0) {
      await ctx.reply('尚未訂閱任何用戶。\n用法：/subscribe @username');
      return;
    }
    const lines = [`訂閱清單（${store.subscriptions.length} 個，每 ${store.checkIntervalHours}h 檢查）：`, ''];
    for (const sub of store.subscriptions) {
      const checked = sub.lastCheckedAt
        ? `上次檢查：${sub.lastCheckedAt.slice(0, 16)}`
        : '尚未檢查';
      lines.push(`• @${sub.username} (${sub.platform}) — ${checked}`);
    }
    await ctx.reply(lines.join('\n'));
    return;
  }

  // --- Remove ---
  if (args.toLowerCase().startsWith('remove ')) {
    const username = args.slice(7).trim();
    const removed = removeSubscription(store, username);
    if (removed) {
      await saveSubscriptions(store);
      await ctx.reply(`✅ 已取消訂閱 @${username.replace(/^@/, '')}`);
    } else {
      await ctx.reply(`找不到 @${username.replace(/^@/, '')} 的訂閱。`);
    }
    return;
  }

  // --- Add subscription ---
  const username = args.replace(/^@/, '').trim();
  if (!username || username.includes(' ')) {
    await ctx.reply('用法：/subscribe @username\n目前僅支援 Threads 平台。');
    return;
  }

  const added = addSubscription(store, username, 'threads');
  if (!added) {
    await ctx.reply(`@${username} 已在訂閱清單中。`);
    return;
  }

  await saveSubscriptions(store);
  await ctx.reply(
    `✅ 已訂閱 @${username} (Threads)\n` +
    `每 ${store.checkIntervalHours} 小時自動檢查新貼文。\n` +
    `查看清單：/subscribe list`,
  );
  logger.info('subscribe', '新增訂閱', { username });
}
