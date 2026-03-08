/**
 * /recommend, /brief, /compare — query knowledge base from Telegram.
 * Pure queries on vault-knowledge.json, no API calls needed.
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../utils/config.js';
import { loadKnowledge } from '../knowledge/knowledge-store.js';
import { aggregateKnowledge, getTopEntities, getInsightsByTopic } from '../knowledge/knowledge-aggregator.js';
import type { VaultKnowledge, NoteAnalysis, KnowledgeEntity } from '../knowledge/types.js';
import { tagForceReply, forceReplyMarkup } from '../utils/force-reply.js';

const TYPE_LABEL: Record<string, string> = {
  tool: '工具', concept: '概念', person: '人物', framework: '框架',
  company: '公司', technology: '技術', platform: '平台', language: '語言',
};

const CALLBACK_CACHE_LIMIT = 500;
const callbackPayloadCache = new Map<string, string>();

function rememberCallbackPayload(command: string, payload: string): string {
  const token = createHash('sha1').update(command + ':' + payload).digest('hex').slice(0, 12);
  const key = command + ':' + token;
  callbackPayloadCache.set(key, payload);

  if (callbackPayloadCache.size > CALLBACK_CACHE_LIMIT) {
    const oldest = callbackPayloadCache.keys().next().value;
    if (oldest) callbackPayloadCache.delete(oldest);
  }

  return token;
}

export function buildCallbackData(command: string, payload: string): string {
  return `${command}:${rememberCallbackPayload(command, payload)}`;
}

export function resolveCallbackPayload(command: string, tokenOrPayload: string): string {
  const key = command + ':' + tokenOrPayload;
  return callbackPayloadCache.get(key) ?? tokenOrPayload;
}

export function resolveCallbackToken(command: string, token: string): string | null {
  const key = command + ':' + token;
  return callbackPayloadCache.get(key) ?? null;
}
/** /recommend <topic> — find related notes by topic */
export async function handleRecommend(ctx: Context, _config: AppConfig): Promise<void> {
  const topic = extractArg(ctx);
  if (!topic) {
    await replyWithTopicPicker(ctx, 'recommend', '請選擇主題或輸入關鍵字：');
    return;
  }
  await runRecommend(ctx, topic);
}

/** /brief <topic> — aggregated knowledge briefing */
export async function handleBrief(ctx: Context, _config: AppConfig): Promise<void> {
  const topic = extractArg(ctx);
  if (!topic) {
    await replyWithTopicPicker(ctx, 'brief', '請選擇主題或輸入關鍵字：');
    return;
  }
  await runBrief(ctx, topic);
}

/** /compare <A> vs <B> — entity comparison */
export async function handleCompare(ctx: Context, _config: AppConfig): Promise<void> {
  const arg = extractArg(ctx);
  if (!arg || !arg.includes('vs')) {
    await replyWithComparePicker(ctx);
    return;
  }
  await runCompare(ctx, arg);
}

export async function handleRecommendByTopic(ctx: Context, topic: string): Promise<void> {
  await runRecommend(ctx, topic);
}

export async function handleBriefByTopic(ctx: Context, topic: string): Promise<void> {
  await runBrief(ctx, topic);
}

export async function handleCompareByArg(ctx: Context, arg: string): Promise<void> {
  await runCompare(ctx, arg);
}

async function runRecommend(ctx: Context, topic: string): Promise<void> {
  const knowledge = await loadAndAggregate();
  if (!knowledge) {
    await ctx.reply('知識庫為空，請先執行 /vault-analyze');
    return;
  }

  const matchedNotes = findNotesByTopic(knowledge, topic);
  if (matchedNotes.length === 0) {
    await ctx.reply(`找不到與「${topic}」相關的筆記。`);
    return;
  }

  const entity = findEntity(knowledge, topic);
  const header = entity
    ? `📚 ${entity.name} 相關筆記（${entity.mentions} 篇提及）`
    : `📚 「${topic}」相關筆記`;

  const lines = [header, ''];
  for (const n of matchedNotes.slice(0, 10)) {
    const stars = '⭐'.repeat(Math.min(n.qualityScore, 5));
    lines.push(`${stars} ${n.title.slice(0, 50)}`);
  }

  const insights = getInsightsByTopic(knowledge, topic).slice(0, 3);
  if (insights.length > 0) {
    lines.push('', '💡 相關洞察：');
    for (const ins of insights) {
      lines.push(`• ${ins.content.slice(0, 80)}`);
    }
  }

  await ctx.reply(lines.join('\n'));
}

async function runBrief(ctx: Context, topic: string): Promise<void> {
  const knowledge = await loadAndAggregate();
  if (!knowledge) {
    await ctx.reply('知識庫為空，請先執行 /vault-analyze');
    return;
  }

  const insights = getInsightsByTopic(knowledge, topic);
  const matchedNotes = findNotesByTopic(knowledge, topic);

  if (insights.length === 0 && matchedNotes.length === 0) {
    await ctx.reply(`找不到與「${topic}」相關的知識。`);
    return;
  }

  const lines = [`🧠 ${topic} 知識簡報`, '', `來源：${matchedNotes.length} 篇相關筆記`];

  if (insights.length > 0) {
    lines.push('', '核心洞察：');
    for (const ins of insights.slice(0, 6)) {
      lines.push(`• ${ins.content}`);
    }
  }

  const entitySet = new Set<string>();
  for (const n of matchedNotes) {
    for (const e of n.entities) {
      if (e.name.toLowerCase() !== topic.toLowerCase()) entitySet.add(e.name);
    }
  }
  if (entitySet.size > 0) {
    const entityList = [...entitySet].slice(0, 8).join(', ');
    lines.push('', `🏷 相關實體：${entityList}`);
  }

  await ctx.reply(lines.join('\n'));
}

async function runCompare(ctx: Context, arg: string): Promise<void> {
  const [rawA, rawB] = arg.split(/\s+vs\s+/i).map((s) => s.trim());
  if (!rawA || !rawB) {
    await ctx.reply('格式錯誤，用法：/compare <A> vs <B>');
    return;
  }

  const knowledge = await loadAndAggregate();
  if (!knowledge) {
    await ctx.reply('知識庫為空，請先執行 /vault-analyze');
    return;
  }

  const entityA = findEntity(knowledge, rawA);
  const entityB = findEntity(knowledge, rawB);

  const lines = [`⚖️ ${rawA} vs ${rawB}`, ''];

  lines.push(...formatEntitySection(knowledge, rawA, entityA));
  lines.push('');
  lines.push(...formatEntitySection(knowledge, rawB, entityB));

  const directRels = findDirectRelations(knowledge, rawA, rawB);
  if (directRels.length > 0) {
    lines.push('', '🔗 直接關係：');
    for (const r of directRels) {
      lines.push(`• ${r.from} → ${r.to}：${r.description}`);
    }
  }

  await ctx.reply(lines.join('\n'));
}
// --- Helpers ---

function extractArg(ctx: Context): string | null {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const parts = text.split(/\s+/);
  parts.shift(); // Remove command
  const arg = parts.join(' ').trim();
  return arg || null;
}

async function loadAndAggregate(): Promise<VaultKnowledge | null> {
  const k = await loadKnowledge();
  if (Object.keys(k.notes).length === 0) return null;
  aggregateKnowledge(k);
  return k;
}

function findEntity(knowledge: VaultKnowledge, name: string): KnowledgeEntity | null {
  if (!knowledge.globalEntities) return null;
  const key = name.toLowerCase().trim();
  if (knowledge.globalEntities[key]) return knowledge.globalEntities[key];
  // Search aliases
  for (const e of Object.values(knowledge.globalEntities)) {
    if (e.aliases.some(a => a.toLowerCase().includes(key))) return e;
  }
  return null;
}

function findNotesByTopic(knowledge: VaultKnowledge, topic: string): NoteAnalysis[] {
  const topicLower = topic.toLowerCase();
  return Object.values(knowledge.notes)
    .filter(note => {
      const catMatch = note.category.toLowerCase().includes(topicLower);
      const entityMatch = note.entities.some(e =>
        e.name.toLowerCase().includes(topicLower) ||
        e.aliases.some(a => a.toLowerCase().includes(topicLower)),
      );
      const titleMatch = note.title.toLowerCase().includes(topicLower);
      return catMatch || entityMatch || titleMatch;
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

function formatEntitySection(knowledge: VaultKnowledge, name: string, entity: KnowledgeEntity | null): string[] {
  const lines: string[] = [];
  if (entity) {
    lines.push(`📌 ${entity.name} [${TYPE_LABEL[entity.type] ?? entity.type}] — ${entity.mentions} 篇提及`);
    // Find alternatives
    const alts = findAlternatives(knowledge, entity.name);
    if (alts.length > 0) lines.push(`  替代：${alts.join(', ')}`);
    // Top insights
    const insights = getInsightsByTopic(knowledge, entity.name).slice(0, 3);
    if (insights.length > 0) {
      for (const ins of insights) lines.push(`  • ${ins.content.slice(0, 60)}`);
    }
  } else {
    lines.push(`📌 ${name} — 知識庫中未找到此實體`);
  }
  return lines;
}

function findAlternatives(knowledge: VaultKnowledge, entityName: string): string[] {
  const nameLower = entityName.toLowerCase();
  const alts = new Set<string>();
  for (const note of Object.values(knowledge.notes)) {
    for (const r of note.relations) {
      if (r.type === 'alternative_to') {
        if (r.from.toLowerCase() === nameLower) alts.add(r.to);
        if (r.to.toLowerCase() === nameLower) alts.add(r.from);
      }
    }
  }
  return [...alts].slice(0, 5);
}

function findDirectRelations(knowledge: VaultKnowledge, a: string, b: string) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const results: Array<{ from: string; to: string; type: string; description: string }> = [];
  for (const note of Object.values(knowledge.notes)) {
    for (const r of note.relations) {
      const fromMatch = r.from.toLowerCase().includes(aLower) || r.from.toLowerCase().includes(bLower);
      const toMatch = r.to.toLowerCase().includes(aLower) || r.to.toLowerCase().includes(bLower);
      if (fromMatch && toMatch) results.push(r);
    }
  }
  return results;
}

// --- InlineKeyboard helpers ---

/** Show top entities as InlineKeyboard buttons + ForceReply fallback */
async function replyWithTopicPicker(ctx: Context, command: string, prompt: string): Promise<void> {
  const knowledge = await loadAndAggregate();
  if (!knowledge) {
    await ctx.reply(
      tagForceReply(command, prompt),
      forceReplyMarkup('輸入主題…'),
    );
    return;
  }

  const topEntities = getTopEntities(knowledge, 6);
  if (topEntities.length === 0) {
    await ctx.reply(
      tagForceReply(command, prompt),
      forceReplyMarkup('輸入主題…'),
    );
    return;
  }

  // Build 2-column keyboard from top entities
  const buttons: Array<{ text: string; callback_data: string }[]> = [];
  for (let i = 0; i < topEntities.length; i += 2) {
    const row = [Markup.button.callback(topEntities[i].name, buildCallbackData(command, topEntities[i].name))];
    if (i + 1 < topEntities.length) {
      row.push(Markup.button.callback(topEntities[i + 1].name, buildCallbackData(command, topEntities[i + 1].name)));
    }
    buttons.push(row);
  }

  await ctx.reply(
    tagForceReply(command, prompt),
    Markup.inlineKeyboard(buttons),
  );
}

/** Show top entity pairs as InlineKeyboard for /compare */
async function replyWithComparePicker(ctx: Context): Promise<void> {
  const knowledge = await loadAndAggregate();
  if (!knowledge) {
    await ctx.reply(
      tagForceReply('compare', '用法：/compare <A> vs <B>'),
      forceReplyMarkup('輸入 A vs B…'),
    );
    return;
  }

  const topEntities = getTopEntities(knowledge, 6);
  if (topEntities.length < 2) {
    await ctx.reply(
      tagForceReply('compare', '用法：/compare <A> vs <B>'),
      forceReplyMarkup('輸入 A vs B…'),
    );
    return;
  }

  // Generate comparison pairs from top entities
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < Math.min(topEntities.length, 4); i++) {
    for (let j = i + 1; j < Math.min(topEntities.length, 4); j++) {
      pairs.push([topEntities[i].name, topEntities[j].name]);
      if (pairs.length >= 3) break;
    }
    if (pairs.length >= 3) break;
  }

  const buttons = pairs.map(([a, b]) => [
    Markup.button.callback(`${a} vs ${b}`, buildCallbackData('compare', `${a} vs ${b}`)),
  ]);

  await ctx.reply('選擇對比組合或輸入自訂：', Markup.inlineKeyboard(buttons));
}


