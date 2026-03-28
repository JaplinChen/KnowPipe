/**
 * Persistent storage for user save events and preference summaries.
 * JSON file at data/user-memory.json with in-memory cache.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '../core/logger.js';
import type { SaveEvent, UserMemoryStore, PreferenceSummary } from './memory-types.js';
import { EMPTY_STORE, SUMMARY_THRESHOLD } from './memory-types.js';
import { generatePreferenceSummary } from './preference-summarizer.js';

const STORE_PATH = join(process.cwd(), 'data', 'user-memory.json');
const MAX_EVENTS = 500; // keep last N events to limit file size

let cache: UserMemoryStore | null = null;
let dirty = false;

async function load(): Promise<UserMemoryStore> {
  if (cache) return cache;
  try {
    const raw = await readFile(STORE_PATH, 'utf-8');
    cache = { ...EMPTY_STORE, ...JSON.parse(raw) as Partial<UserMemoryStore> };
  } catch {
    cache = { ...EMPTY_STORE };
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache || !dirty) return;
  try {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    dirty = false;
  } catch (err) {
    logger.warn('memory', '儲存失敗', { error: (err as Error).message });
  }
}

/** Record a save event (fire-and-forget). */
export async function recordSave(
  userId: number,
  category: string,
  keywords: string[],
  platform: string,
  title: string,
): Promise<void> {
  const store = await load();
  const event: SaveEvent = {
    userId, category, keywords, platform, title,
    ts: new Date().toISOString(),
  };
  store.events.push(event);

  // Trim old events
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
  dirty = true;

  // Check if summary needs regeneration
  const userEvents = store.events.filter((e) => e.userId === userId);
  const existing = store.summaries[String(userId)];
  const eventsAfterSummary = existing
    ? userEvents.filter((e) => e.ts > existing.generatedAt).length
    : userEvents.length;

  if (eventsAfterSummary >= SUMMARY_THRESHOLD) {
    // Generate summary in background
    generatePreferenceSummary(userEvents).then((summary) => {
      if (summary) {
        store.summaries[String(userId)] = summary;
        dirty = true;
        persist().catch(() => {});
        logger.info('memory', '偏好摘要已更新', { userId });
      }
    }).catch(() => {});
  }

  await persist();
}

/** Get preference summary for a user (if available). */
export async function getPreference(userId: number): Promise<PreferenceSummary | null> {
  const store = await load();
  return store.summaries[String(userId)] ?? null;
}

/** Get event count for a user. */
export async function getUserEventCount(userId: number): Promise<number> {
  const store = await load();
  return store.events.filter((e) => e.userId === userId).length;
}
