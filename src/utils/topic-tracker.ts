/**
 * Topic tracker — records category/keyword frequencies after each save.
 * Emits alerts when a topic accumulates beyond a configurable threshold,
 * suggesting the user run /consolidate to synthesize related notes.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../core/logger.js';

const TRACKER_DIR = '.data';
const TRACKER_FILE = 'topic-tracker.json';
const ALERT_THRESHOLD = 10;

export interface TopicStats {
  category: string;
  count: number;
  keywords: Record<string, number>;
  lastSeen: string;
}

interface TrackerData {
  updatedAt: string;
  categories: Record<string, TopicStats>;
}

function trackerPath(vaultPath: string): string {
  return join(vaultPath, 'GetThreads', TRACKER_DIR, TRACKER_FILE);
}

async function loadTracker(vaultPath: string): Promise<TrackerData> {
  try {
    const raw = await readFile(trackerPath(vaultPath), 'utf-8');
    return JSON.parse(raw) as TrackerData;
  } catch {
    return { updatedAt: new Date().toISOString(), categories: {} };
  }
}

async function saveTracker(vaultPath: string, data: TrackerData): Promise<void> {
  const dir = join(vaultPath, 'GetThreads', TRACKER_DIR);
  await mkdir(dir, { recursive: true });
  data.updatedAt = new Date().toISOString();
  await writeFile(trackerPath(vaultPath), JSON.stringify(data, null, 2), 'utf-8');
}

export interface TopicAlert {
  category: string;
  count: number;
  message: string;
}

/**
 * Record a save event and return any alerts for over-represented topics.
 */
export async function trackTopic(
  vaultPath: string,
  category: string,
  keywords: string[],
): Promise<TopicAlert | null> {
  const data = await loadTracker(vaultPath);
  const today = new Date().toISOString().split('T')[0];

  // Update category stats
  if (!data.categories[category]) {
    data.categories[category] = { category, count: 0, keywords: {}, lastSeen: today };
  }
  const stats = data.categories[category];
  stats.count++;
  stats.lastSeen = today;

  // Update keyword frequencies
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    stats.keywords[lower] = (stats.keywords[lower] ?? 0) + 1;
  }

  await saveTracker(vaultPath, data);

  // Check threshold — alert on exact threshold hit (not every save after)
  if (stats.count === ALERT_THRESHOLD) {
    const topKw = Object.entries(stats.keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k)
      .join('、');

    const alert: TopicAlert = {
      category,
      count: stats.count,
      message: `📊 「${category}」已累積 ${stats.count} 篇筆記（熱門關鍵字：${topKw}）。建議執行 /consolidate 整合相關知識。`,
    };
    logger.info('topic-tracker', alert.message);
    return alert;
  }

  return null;
}

/**
 * Get the full topic distribution for reporting.
 */
export async function getTopicDistribution(vaultPath: string): Promise<TopicStats[]> {
  const data = await loadTracker(vaultPath);
  return Object.values(data.categories).sort((a, b) => b.count - a.count);
}
