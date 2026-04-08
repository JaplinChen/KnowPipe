/**
 * Pure helper functions for knowledge queries (recommend/brief/compare).
 */
import type { VaultKnowledge, NoteAnalysis, KnowledgeEntity } from '../knowledge/types.js';
import { getInsightsByTopic } from '../knowledge/knowledge-aggregator.js';
import { runLocalLlmPrompt } from '../utils/local-llm.js';

/* ── Context Engineering 模板路由 ──────────────────────────────────────── */

const CONTEXT_TEMPLATES: Record<string, string> = {
  tech: `分析框架（技術主題）
1. 核心技術原理與創新點
2. 與現有方案的差異比較
3. 實際應用場景與限制
4. 開發者需要注意的技術細節`,
  business: `分析框架（商業/產業主題）
1. 市場規模與趨勢方向
2. 主要玩家與競爭態勢
3. 商業模式與盈利邏輯
4. 風險因素與機會窗口`,
  research: `分析框架（研究/學術主題）
1. 研究問題與核心假設
2. 方法論與實驗設計
3. 核心發現與結論
4. 對實踐的啟示`,
};

/** 根據主題與筆記自動偵測適用的分析框架類型 */
function detectTemplateType(topic: string, notes: NoteAnalysis[]): string {
  const combined = (topic + ' ' + notes.slice(0, 5).map(n => n.category + ' ' + n.title).join(' ')).toLowerCase();
  if (/研究|論文|arxiv|實驗|模型評估|benchmark|ablation/.test(combined)) return 'research';
  if (/商業|市場|創業|投資|趨勢|產業|融資|競爭|用戶增長/.test(combined)) return 'business';
  return 'tech';
}

/**
 * 用 LLM + Context Engineering 模板合成知識簡報。
 * 僅在 notes >= 3 時呼叫，節省 token。
 */
export async function synthesizeBrief(
  topic: string,
  notes: NoteAnalysis[],
  insights: Array<{ content: string }>,
): Promise<string | null> {
  if (notes.length < 3) return null;

  const templateType = detectTemplateType(topic, notes);
  const template = CONTEXT_TEMPLATES[templateType];
  const notesTitles = notes.slice(0, 8).map(n => `- ${n.title.slice(0, 60)}`).join('\n');
  const insightLines = insights.slice(0, 5).map(i => `• ${i.content.slice(0, 80)}`).join('\n');

  const prompt = [
    'CAVEMAN RULE: Output ONLY the brief text. No preamble. No JSON.',
    `你是知識簡報生成器。使用以下分析框架對「${topic}」進行綜合分析：`,
    '',
    template,
    '',
    `相關筆記（${notes.length} 篇）：`,
    notesTitles,
    insightLines ? `\n核心洞察：\n${insightLines}` : '',
    '',
    '用繁體中文寫 120-160 字的知識簡報。語氣中性專業，只保留可驗證事實，不要推銷語。',
  ].filter(Boolean).join('\n');

  try {
    return await runLocalLlmPrompt(prompt, { timeoutMs: 25_000, model: 'standard', maxTokens: 400 });
  } catch {
    return null;
  }
}

const TYPE_LABEL: Record<string, string> = {
  tool: '工具', concept: '概念', person: '人物', framework: '框架',
  company: '公司', technology: '技術', platform: '平台', language: '語言',
};

export function findEntity(knowledge: VaultKnowledge, name: string): KnowledgeEntity | null {
  if (!knowledge.globalEntities) return null;
  const key = name.toLowerCase().trim();
  if (knowledge.globalEntities[key]) return knowledge.globalEntities[key];
  for (const e of Object.values(knowledge.globalEntities)) {
    if (e.aliases.some(a => a.toLowerCase().includes(key))) return e;
  }
  return null;
}

export function findNotesByTopic(knowledge: VaultKnowledge, topic: string): NoteAnalysis[] {
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

export function formatEntitySection(
  knowledge: VaultKnowledge, name: string, entity: KnowledgeEntity | null,
): string[] {
  const lines: string[] = [];
  if (entity) {
    lines.push(`📌 ${entity.name} [${TYPE_LABEL[entity.type] ?? entity.type}] — ${entity.mentions} 篇提及`);
    const alts = findAlternatives(knowledge, entity.name);
    if (alts.length > 0) lines.push(`  替代：${alts.join(', ')}`);
    const insights = getInsightsByTopic(knowledge, entity.name).slice(0, 3);
    if (insights.length > 0) {
      for (const ins of insights) lines.push(`  • ${ins.content.slice(0, 60)}`);
    }
  } else {
    lines.push(`📌 ${name} — 知識庫中未找到此實體`);
  }
  return lines;
}

export function findAlternatives(knowledge: VaultKnowledge, entityName: string): string[] {
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

export function findDirectRelations(knowledge: VaultKnowledge, a: string, b: string) {
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
