/**
 * /search — unified search entry point.
 * Modes: 主題 (topic) | 作者 (author) | 關鍵字 (keyword) | Vault
 * Old /search, /monitor sub-commands remain for backward compatibility.
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { handleFind } from './find-command.js';
import { handleSearch, handleMonitor, handleMonitorTopic, handleMonitorAuthor } from './monitor-command.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';
import { loadKnowledge } from '../knowledge/knowledge-store.js';
import { aggregateKnowledge, getRecentTopEntities } from '../knowledge/knowledge-aggregator.js';

type SubHandler = (ctx: Context, config: AppConfig) => Promise<void>;

/** Legacy sub-command routing (backward compat) */
const LEGACY_MODES: Record<string, { handler: SubHandler; prefix: string }> = {
  vault: { handler: handleFind, prefix: '/find' },
  web: { handler: handleSearch, prefix: '/search' },
  monitor: { handler: handleMonitor, prefix: '/monitor' },
};

function rewriteText(ctx: Context, newCommand: string, args: string): void {
  const text = args ? `${newCommand} ${args}` : newCommand;
  const existingMsg = ctx.message as unknown as Record<string, unknown> | undefined;
  if (existingMsg) { existingMsg.text = text; }
  else {
    const cbMsg = (ctx.callbackQuery?.message ?? {}) as Record<string, unknown>;
    (ctx.update as unknown as Record<string, unknown>).message = { ...cbMsg, text };
  }
}

export async function handleSearchHub(ctx: Context, config: AppConfig): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const parts = text.replace(/^\/search\s*/i, '').trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase() ?? '';
  const rest = parts.slice(1).join(' ');

  // /search topic <topic>
  if (sub === 'topic' && rest) {
    await handleMonitorTopic(ctx, config, rest);
    return;
  }

  // /search author <author>
  if (sub === 'author' && rest) {
    await handleMonitorAuthor(ctx, config, rest);
    return;
  }

  // /search keyword <kw> or /search monitor <kw> (backward compat)
  if ((sub === 'keyword' || sub === 'monitor') && rest) {
    rewriteText(ctx, '/monitor', rest);
    await handleMonitor(ctx, config);
    return;
  }

  // /search vault <kw>
  if (sub === 'vault' && rest) {
    rewriteText(ctx, '/find', rest);
    await handleFind(ctx, config);
    return;
  }

  // Legacy: /search web <query>
  const legacyMode = LEGACY_MODES[sub];
  if (legacyMode && rest) {
    rewriteText(ctx, legacyMode.prefix, rest);
    await legacyMode.handler(ctx, config);
    return;
  }

  // /search <anything without mode keyword> → treat as keyword search
  if (sub && !Object.keys(LEGACY_MODES).includes(sub) && sub !== 'topic' && sub !== 'author' && sub !== 'keyword') {
    rewriteText(ctx, '/monitor', parts.join(' '));
    await handleMonitor(ctx, config);
    return;
  }

  // No args → show mode picker with Vault topic suggestions
  await replyWithSearchPicker(ctx, config);
}

/** Build the main search picker with topic buttons from recent Vault notes */
async function replyWithSearchPicker(ctx: Context, config: AppConfig): Promise<void> {
  // Load recent entities from Vault for topic suggestions
  let topicButtons: ReturnType<typeof Markup.button.callback>[][] = [];
  try {
    const knowledge = await loadKnowledge();
    if (Object.keys(knowledge.notes).length > 0) {
      aggregateKnowledge(knowledge);
      const recent = getRecentTopEntities(knowledge, 6);
      if (recent.length > 0) {
        for (let i = 0; i < recent.length; i += 2) {
          const row = [Markup.button.callback(recent[i].name, `srch:topic:${recent[i].name.slice(0, 45)}`)];
          if (i + 1 < recent.length) {
            row.push(Markup.button.callback(recent[i + 1].name, `srch:topic:${recent[i + 1].name.slice(0, 45)}`));
          }
          topicButtons.push(row);
        }
      }
    }
  } catch { /* best-effort */ }

  const modeRow = [
    Markup.button.callback('🏷 主題', 'srch:mode:topic'),
    Markup.button.callback('👤 作者', 'srch:mode:author'),
    Markup.button.callback('🔑 關鍵字', 'srch:mode:keyword'),
    Markup.button.callback('🔍 Vault', 'srch:mode:vault'),
  ];

  const buttons = topicButtons.length > 0
    ? [modeRow, ...topicButtons]
    : [modeRow];

  await ctx.reply('選擇搜尋模式：', Markup.inlineKeyboard(buttons));
}

/** Handle srch:* callbacks */
export async function handleSearchCallback(
  ctx: Context & { match: RegExpExecArray },
  config: AppConfig,
): Promise<void> {
  const raw = ctx.match[1]; // e.g. "mode:topic", "mode:author", "topic:Claude Code"
  await ctx.answerCbQuery().catch(() => {});

  // srch:topic:<entity> — direct topic search from entity button
  if (raw.startsWith('topic:')) {
    const topic = raw.slice(6);
    await handleMonitorTopic(ctx, config, topic);
    return;
  }

  // srch:mode:<mode> — show ForceReply for the selected mode
  if (raw.startsWith('mode:')) {
    const mode = raw.slice(5);
    const prompts: Record<string, { tag: string; text: string; placeholder: string }> = {
      topic: { tag: 'srch-topic', text: '輸入主題（例：Claude Code）：', placeholder: '主題…' },
      author: { tag: 'srch-author', text: '輸入作者名稱或 handle（例：@karpathy）：', placeholder: '作者名稱…' },
      keyword: { tag: 'monitor', text: '輸入關鍵字：', placeholder: '關鍵字…' },
      vault: { tag: 'find', text: '搜尋 Vault 筆記：', placeholder: '關鍵字…' },
    };
    const p = prompts[mode];
    if (p) {
      await ctx.reply(tagForceReply(p.tag, p.text), forceReplyMarkup(p.placeholder));
    }
    return;
  }

  // Legacy: srch:vault | srch:web | srch:monitor | srch:video
  const legacyPrompts: Record<string, { tag: string; text: string; placeholder: string }> = {
    vault: { tag: 'find', text: '請輸入 Vault 搜尋關鍵字：', placeholder: '關鍵字…' },
    web: { tag: 'search', text: '請輸入網頁搜尋查詢：', placeholder: '查詢…' },
    monitor: { tag: 'monitor', text: '請輸入跨平台搜尋關鍵字：', placeholder: '關鍵字…' },
    video: { tag: 'vsearch-hub', text: '請輸入影片搜尋關鍵字：', placeholder: '關鍵字…' },
  };
  const legacy = legacyPrompts[raw];
  if (legacy) {
    await ctx.reply(tagForceReply(legacy.tag, legacy.text), forceReplyMarkup(legacy.placeholder));
  }
}
