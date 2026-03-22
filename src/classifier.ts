/** Keyword-based content classifier with optional LLM fallback via oMLX */
import { classifyWithLearnedRules } from './learning/dynamic-classifier.js';
import { CATEGORIES, type CategoryRule } from './classifier-categories.js';
import { logger } from './core/logger.js';

/** 短 ASCII 關鍵字（≤3 字元）用 word boundary，避免 'ai' 匹配 'Aitken' 等 substring 誤判 */
function keywordMatch(h: string, kw: string): boolean {
  const k = kw.toLowerCase();
  return k.length <= 3 && /^[a-z0-9]+$/.test(k) ? new RegExp(`\\b${k}\\b`).test(h) : h.includes(k);
}

/** 檢查該分類的 exclude 關鍵字是否命中（命中 = 應排除此分類） */
function isExcluded(cat: CategoryRule, titleH: string, bodyH: string): boolean {
  if (!cat.exclude?.length) return false;
  return cat.exclude.some(kw => keywordMatch(titleH, kw) || keywordMatch(bodyH, kw));
}

/** 計算分類的關鍵字命中分數：標題命中 ×2，本文命中 ×1 */
function scoreCategory(cat: CategoryRule, titleH: string, bodyH: string): number {
  let score = 0;
  for (const kw of cat.keywords) {
    if (keywordMatch(titleH, kw)) score += 2;
    else if (bodyH && keywordMatch(bodyH, kw)) score += 1;
  }
  return score;
}

/** Keyword scoring logic (synchronous) */
function keywordClassify(title: string, text: string): { category: string; score: number } {
  const titleH = title.toLowerCase();
  const bodyH = text.toLowerCase();

  const scores = new Map<string, { score: number; order: number }>();

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    if (isExcluded(cat, titleH, bodyH)) continue;

    const score = scoreCategory(cat, titleH, bodyH);
    if (score <= 0) continue;

    const existing = scores.get(cat.name);
    if (existing) {
      existing.score += score;
    } else {
      scores.set(cat.name, { score, order: i });
    }
  }

  let bestName = '';
  let bestScore = 0;
  let bestOrder = Infinity;

  for (const [name, { score, order }] of scores) {
    if (score > bestScore || (score === bestScore && order < bestOrder)) {
      bestName = name;
      bestScore = score;
      bestOrder = order;
    }
  }

  return { category: bestName || '其他', score: bestScore };
}

/** Top-level category names for LLM prompt (deduplicated) */
function getTopLevelCategories(): string[] {
  const seen = new Set<string>();
  for (const cat of CATEGORIES) {
    const topLevel = cat.name.split('/').slice(0, 2).join('/');
    seen.add(topLevel);
  }
  return [...seen];
}

/**
 * LLM-based classification fallback. Only called when keyword scoring
 * returns "其他" (no match). Uses oMLX local inference for zero-cost classification.
 */
async function llmClassify(title: string, text: string): Promise<string | null> {
  try {
    const { runLocalLlmPrompt } = await import('./utils/local-llm.js');
    const categories = getTopLevelCategories().slice(0, 30).join('、');
    const snippet = text.slice(0, 500);

    const prompt = [
      '你是內容分類器。根據以下標題和內容片段，從分類列表中選出最合適的一個分類。',
      '只回答分類名稱，不要加任何解釋。',
      '',
      `分類列表：${categories}`,
      '',
      `標題：${title}`,
      `內容：${snippet}`,
      '',
      '分類：',
    ].join('\n');

    const result = await runLocalLlmPrompt(prompt, { timeoutMs: 15_000, model: 'flash' });
    if (!result) return null;

    // Validate: must match one of our categories (partial match allowed)
    const cleaned = result.trim().replace(/^分類[：:]\s*/, '');
    const topLevels = getTopLevelCategories();
    const match = topLevels.find((c) => cleaned.includes(c) || c.includes(cleaned));
    return match ?? null;
  } catch {
    return null;
  }
}

export function classifyContent(title: string, text: string): string {
  // Step 0：優先使用 vault 學習到的規則（信心 >= 0.75）
  const learned = classifyWithLearnedRules(title, text);
  if (learned) return learned;

  // Step 1：關鍵字計分
  const { category, score } = keywordClassify(title, text);

  // If keyword scoring found a match, use it
  if (category !== '其他') return category;

  // Step 2：「其他」分類時，嘗試 LLM fallback（非同步，但不阻塞）
  // Note: classifyContent is sync, so LLM fallback is deferred to classifyContentAsync
  return category;
}

/**
 * Async classifier with LLM fallback. Use this when you can await.
 * Falls back to keyword-only result if LLM is unavailable.
 */
export async function classifyContentAsync(title: string, text: string): Promise<string> {
  const learned = classifyWithLearnedRules(title, text);
  if (learned) return learned;

  const { category, score } = keywordClassify(title, text);
  if (category !== '其他') return category;

  // Try LLM classification (oMLX local → opencode → DDG)
  logger.info('classifier', 'keyword scoring returned 其他, trying LLM fallback');
  const llmResult = await llmClassify(title, text);
  if (llmResult) {
    logger.info('classifier', 'LLM classified as', { category: llmResult });
    return llmResult;
  }

  return '其他';
}

/** 從內容中提取命中的所有關鍵詞（最多 5 個），供 frontmatter keywords 欄位使用 */
export function extractKeywords(title: string, text: string): string[] {
  const titleH = title.toLowerCase();
  const bodyH = text.toLowerCase();
  const matched: string[] = [];
  for (const cat of CATEGORIES) {
    if (isExcluded(cat, titleH, bodyH)) continue;
    for (const kw of cat.keywords) {
      if (keywordMatch(titleH, kw) || keywordMatch(bodyH, kw)) {
        matched.push(kw);
        if (matched.length >= 5) return matched;
      }
    }
  }
  return matched;
}
