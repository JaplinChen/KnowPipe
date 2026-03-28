/**
 * Hacker News patrol source — Firebase API (free, no auth).
 * Fetches top stories and filters by relevance to user topics.
 */
import type { PatrolItem, PatrolSource } from './source-types.js';
import { logger } from '../../core/logger.js';

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const FETCH_TIMEOUT = 10_000;
const TOP_N = 30; // fetch top 30 story IDs

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  type?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function fetchStoryIds(): Promise<number[]> {
  const ids = await fetchJson<number[]>(`${HN_API}/topstories.json`);
  return ids?.slice(0, TOP_N) ?? [];
}

async function fetchItem(id: number): Promise<HNItem | null> {
  return fetchJson<HNItem>(`${HN_API}/item/${id}.json`);
}

export const hnSource: PatrolSource = {
  name: 'hn',

  async fetch(_topics: string[]): Promise<PatrolItem[]> {
    const ids = await fetchStoryIds();
    if (ids.length === 0) {
      logger.warn('patrol-hn', 'Failed to fetch top stories');
      return [];
    }

    // Fetch items in parallel (batch of 10)
    const items: PatrolItem[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.allSettled(batch.map(fetchItem));

      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const item = r.value;
        if (!item.url || item.type !== 'story') continue;

        items.push({
          url: item.url,
          title: item.title ?? '',
          description: `HN Score: ${item.score ?? 0}`,
          score: item.score,
          source: 'hn',
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
        });
      }
    }

    logger.info('patrol-hn', `Fetched ${items.length} stories`);
    return items;
  },
};
