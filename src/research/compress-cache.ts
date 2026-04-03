/**
 * 壓縮快取管理 — 在 data/compress-cache/ 中儲存預處理後的筆記。
 * 用 source hash 判斷新鮮度，避免重複清理。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { preprocessText } from './text-cleaner.js';
import type { CleanLevel, CompressEntry, CompressIndex } from './types.js';

const CACHE_DIR = join(dirname(new URL(import.meta.url).pathname), '../../data/compress-cache');
const INDEX_PATH = join(CACHE_DIR, 'index.json');

/* ── Hash ────────────────────────────────────────────────────── */

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/* ── Index I/O ───────────────────────────────────────────────── */

let cachedIndex: CompressIndex | null = null;

async function loadIndex(): Promise<CompressIndex> {
  if (cachedIndex) return cachedIndex;
  try {
    const raw = await readFile(INDEX_PATH, 'utf-8');
    cachedIndex = JSON.parse(raw) as CompressIndex;
  } catch {
    cachedIndex = { version: 1, entries: {} };
  }
  return cachedIndex;
}

async function saveIndex(index: CompressIndex): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  cachedIndex = index;
}

/* ── 公開 API ────────────────────────────────────────────────── */

/** 取得壓縮快取；若 hash 不匹配回傳 null。 */
export async function getCompressed(notePath: string, currentBody: string): Promise<CompressEntry | null> {
  const index = await loadIndex();
  const entry = index.entries[notePath];
  if (!entry) return null;
  if (entry.sourceHash !== hashBody(currentBody)) return null;
  return entry;
}

/** 寫入壓縮快取。 */
export async function setCompressed(
  notePath: string,
  originalBody: string,
  compressedBody: string,
): Promise<CompressEntry> {
  const index = await loadIndex();
  const entry: CompressEntry = {
    path: notePath,
    compressedBody,
    ratio: originalBody.length > 0 ? compressedBody.length / originalBody.length : 1,
    date: new Date().toISOString(),
    sourceHash: hashBody(originalBody),
  };
  index.entries[notePath] = entry;
  await saveIndex(index);
  return entry;
}

/**
 * 壓縮單篇筆記：先查快取，若過時則重新清理並存入。
 * @returns [壓縮後文本, 壓縮率]
 */
export async function compressNote(
  notePath: string,
  body: string,
  topic = '',
  level: CleanLevel = 'clean',
): Promise<[string, number]> {
  const cached = await getCompressed(notePath, body);
  if (cached) return [cached.compressedBody, cached.ratio];

  const compressed = preprocessText(body, topic, level);
  const entry = await setCompressed(notePath, body, compressed);
  return [compressed, entry.ratio];
}

/**
 * 批次壓縮多篇筆記，限制並行數。
 * @returns 壓縮結果 Map（path → compressedBody）
 */
export async function compressBatch(
  notes: Array<{ path: string; body: string }>,
  topic = '',
  level: CleanLevel = 'clean',
  concurrency = 4,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const queue = [...notes];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const note = queue.shift()!;
      const [compressed] = await compressNote(note.path, note.body, topic, level);
      result.set(note.path, compressed);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, notes.length) }, () => worker()));
  return result;
}

/** 清除快取中的指定路徑。 */
export async function invalidateCache(notePath: string): Promise<void> {
  const index = await loadIndex();
  delete index.entries[notePath];
  await saveIndex(index);
}

/** 取得快取統計資訊。 */
export async function getCacheStats(): Promise<{ count: number; avgRatio: number }> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);
  if (entries.length === 0) return { count: 0, avgRatio: 1 };
  const avg = entries.reduce((sum, e) => sum + e.ratio, 0) / entries.length;
  return { count: entries.length, avgRatio: Math.round(avg * 100) / 100 };
}
