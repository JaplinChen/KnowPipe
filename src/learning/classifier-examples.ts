/**
 * Classifier few-shot examples manager.
 *
 * 儲存手動校正記錄作為 LLM 分類的 few-shot prompt 範例。
 * - recordFeedback() 呼叫時自動追加
 * - /learn 時整理去重、修剪超過上限的舊例子
 */
import { join } from 'node:path';
import { safeWriteJSON, safeReadJSON } from '../core/safe-write.js';

export interface ClassifierExample {
  /** 文章標題 */
  title: string;
  /** body 前 200 字（供相關性計算） */
  snippet: string;
  /** 正確分類（用戶校正後的） */
  category: string;
  /** 加入時間 */
  addedAt: string;
}

interface ExamplesStore {
  version: number;
  examples: ClassifierExample[];
}

const STORE_PATH = join('data', 'classifier-examples.json');
const MAX_EXAMPLES = 200;

let cached: ExamplesStore | null = null;

function defaultStore(): ExamplesStore {
  return { version: 1, examples: [] };
}

export async function loadExamples(): Promise<ClassifierExample[]> {
  if (cached) return cached.examples;
  const loaded = await safeReadJSON<Partial<ExamplesStore>>(STORE_PATH, {});
  cached = { ...defaultStore(), ...loaded };
  return cached.examples;
}

async function saveExamples(store: ExamplesStore): Promise<void> {
  cached = store;
  await safeWriteJSON(STORE_PATH, store);
}

/** 追加一筆新 example。若相同標題已存在則跳過（去重）。 */
export async function addExample(example: ClassifierExample): Promise<void> {
  const examples = await loadExamples();
  if (examples.some(e => e.title === example.title)) return;
  examples.push(example);
  await saveExamples(cached!);
}

/**
 * 整理 examples：去重（相同 title 保留最新）+ 修剪超過 MAX_EXAMPLES 的舊記錄。
 * 由 /learn 指令呼叫。
 * @returns 移除的筆數
 */
export async function trimExamples(): Promise<number> {
  const examples = await loadExamples();
  // 去重：相同 title 保留最後一筆（最新校正）
  const seen = new Map<string, ClassifierExample>();
  for (const ex of examples) {
    seen.set(ex.title, ex);
  }
  const deduped = [...seen.values()];

  // 修剪至最多 MAX_EXAMPLES（保留最新）
  const trimmed = deduped.length > MAX_EXAMPLES
    ? deduped.slice(-MAX_EXAMPLES)
    : deduped;

  const removed = examples.length - trimmed.length;
  cached!.examples = trimmed;
  await saveExamples(cached!);
  return removed;
}

/**
 * 從 examples 中選出最相關的 N 筆，供 LLM few-shot prompt 使用。
 * 策略：詞彙重疊最多的一半 + 最新的一半，去重後截取 maxCount。
 */
export function selectExamples(
  title: string,
  text: string,
  examples: ClassifierExample[],
  maxCount = 12,
): ClassifierExample[] {
  if (examples.length === 0) return [];

  const queryWords = new Set([
    ...tokenize(title),
    ...tokenize(text.slice(0, 300)),
  ]);

  // 計算每筆 example 與當前文章的詞彙重疊分數
  const scored = examples.map(ex => {
    const exWords = new Set([...tokenize(ex.title), ...tokenize(ex.snippet)]);
    let overlap = 0;
    for (const w of queryWords) {
      if (exWords.has(w)) overlap++;
    }
    return { ex, overlap };
  });

  // 按重疊分數降序排列
  scored.sort((a, b) => b.overlap - a.overlap);

  const half = Math.ceil(maxCount / 2);
  const topRelevant = scored.slice(0, half).map(s => s.ex);
  const latestSet = new Set(topRelevant);
  const latest = examples.slice(-half).filter(e => !latestSet.has(e));

  return [...topRelevant, ...latest].slice(0, maxCount);
}

/** 簡單分詞：英文詞彙 + CJK 字符，最小長度過濾 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
}
