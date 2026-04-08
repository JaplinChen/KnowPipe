/**
 * LLM 語意分類器 — classifyContent() 的主路徑。
 *
 * 流程：
 * 1. 從 classifier-examples 選出最相關的 few-shot 範例
 * 2. 建構 prompt（類別清單 + 範例 + 標題/摘要）
 * 3. 呼叫 local-llm（flash tier，15s timeout）
 * 4. 解析 JSON 回傳 { category, confidence }
 * 5. 驗證 category 在合法清單中且 confidence >= 0.6
 * 6. 任何失敗回傳 null，由 classifier.ts 降回下一層
 */
import { runLocalLlmPrompt } from './utils/local-llm.js';
import { CATEGORIES } from './classifier-categories.js';
import { loadExamples, selectExamples, type ClassifierExample } from './learning/classifier-examples.js';
import { logger } from './core/logger.js';

const LLM_TIMEOUT_MS = 15_000;
const BODY_SNIPPET_LEN = 600;
const MIN_CONFIDENCE = 0.6;

/** 所有合法分類名稱的 Set，用於快速驗證 */
const VALID_CATEGORIES = new Set(CATEGORIES.map(c => c.name));

/* ── Prompt 建構 ─────────────────────────────────────────── */

/** 建立層級縮排的類別清單（頂層 + 子類別縮排一格） */
function buildCategoryList(): string {
  const topLevels = [...new Set(CATEGORIES.map(c => c.name.split('/')[0]))];
  const lines: string[] = [];
  for (const top of topLevels) {
    lines.push(top);
    const subs = CATEGORIES.filter(c => c.name !== top && c.name.startsWith(top + '/'));
    for (const sub of subs) {
      lines.push(`  ${sub.name}`);
    }
  }
  return lines.join('\n');
}

/** 建立 few-shot 範例區塊 */
function buildFewShotBlock(examples: ClassifierExample[]): string {
  if (examples.length === 0) return '';
  const lines = examples.map(e => {
    const snippetHint = e.snippet ? `（${e.snippet.slice(0, 60).replace(/\n/g, ' ')}…）` : '';
    return `- 標題：「${e.title}」→ ${e.category}${snippetHint}`;
  });
  return `\n## 過去校正案例（優先參考）\n${lines.join('\n')}`;
}

function buildPrompt(title: string, bodySnippet: string, fewShot: string): string {
  return `你是 Obsidian 筆記分類專家。根據文章標題和摘要，從以下分類中選出最合適的一個。

## 可用分類
${buildCategoryList()}${fewShot}

## 待分類文章
標題：${title}
摘要：${bodySnippet || '（無）'}

請只回傳 JSON，不要其他說明：
{"category": "分類名稱", "confidence": 0.9}

規則：
- category 必須完全符合上方可用分類中的其中一個名稱
- confidence 範圍 0.0~1.0，代表你的把握程度
- 若內容不明確，選最接近的分類並降低 confidence`.trim();
}

/* ── JSON 解析 ───────────────────────────────────────────── */

interface LlmClassifyResult {
  category: string;
  confidence: number;
}

function parseLlmResponse(raw: string): LlmClassifyResult | null {
  // 支援 markdown code block 包裹或裸 JSON
  const jsonMatch = raw.match(/\{[^{}]*"category"[^{}]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { category?: unknown; confidence?: unknown };
    if (typeof parsed.category !== 'string') return null;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    return { category: parsed.category.trim(), confidence };
  } catch {
    return null;
  }
}

/* ── 主要匯出 ────────────────────────────────────────────── */

/**
 * 使用 LLM 進行語意分類。
 * 回傳分類字串，或在以下情況回傳 null（由呼叫方降回關鍵字分類）：
 * - LLM 不可用 / 超時
 * - JSON 解析失敗
 * - 分類不在合法清單中
 * - confidence < 0.6
 */
export async function classifyWithLlm(title: string, text: string): Promise<string | null> {
  try {
    const allExamples = await loadExamples();
    const selected = selectExamples(title, text, allExamples);
    const fewShot = buildFewShotBlock(selected);
    const bodySnippet = text.slice(0, BODY_SNIPPET_LEN);
    const prompt = buildPrompt(title, bodySnippet, fewShot);

    const raw = await runLocalLlmPrompt(prompt, {
      task: 'classify',
      timeoutMs: LLM_TIMEOUT_MS,
      maxTokens: 120,
    });

    if (!raw) return null;

    const result = parseLlmResponse(raw);
    if (!result) {
      logger.info('classifier-llm', 'JSON 解析失敗', { raw: raw.slice(0, 120) });
      return null;
    }

    if (!VALID_CATEGORIES.has(result.category)) {
      logger.info('classifier-llm', '分類不在清單', { category: result.category });
      return null;
    }

    if (result.confidence < MIN_CONFIDENCE) {
      logger.info('classifier-llm', '信心不足，降回關鍵字', {
        category: result.category,
        confidence: result.confidence,
      });
      return null;
    }

    logger.info('classifier-llm', '分類成功', {
      category: result.category,
      confidence: result.confidence,
    });
    return result.category;
  } catch (err) {
    logger.warn('classifier-llm', 'LLM 呼叫失敗', { err: (err as Error).message });
    return null;
  }
}
