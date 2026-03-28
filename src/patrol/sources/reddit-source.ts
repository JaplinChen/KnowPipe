/**
 * Reddit patrol source — JSON API (free, User-Agent required).
 * Fetches hot posts from specified subreddits.
 */
import type { PatrolItem, PatrolSource } from './source-types.js';
import { logger } from '../../core/logger.js';

const FETCH_TIMEOUT = 10_000;
const PER_SUB_LIMIT = 10;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_SUBS = ['MachineLearning', 'LocalLLaMA', 'ObsidianMD', 'selfhosted'];

interface RedditChild {
  data: {
    title?: string;
    url?: string;
    permalink?: string;
    score?: number;
    created_utc?: number;
    selftext?: string;
    is_self?: boolean;
    num_comments?: number;
  };
}

interface RedditListing {
  data?: {
    children?: RedditChild[];
  };
}

async function fetchSubreddit(sub: string): Promise<PatrolItem[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=${PER_SUB_LIMIT}&raw_json=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return [];

    const json = await res.json() as RedditListing;
    const children = json.data?.children ?? [];

    return children
      .filter((c) => c.data.title && !c.data.title.startsWith('[D]'))
      .map((c): PatrolItem => {
        const d = c.data;
        const itemUrl = d.is_self
          ? `https://www.reddit.com${d.permalink}`
          : (d.url ?? `https://www.reddit.com${d.permalink}`);
        return {
          url: itemUrl,
          title: `[r/${sub}] ${d.title ?? ''}`,
          description: d.selftext?.slice(0, 200) ?? '',
          score: d.score,
          source: 'reddit',
          publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
        };
      });
  } catch {
    logger.warn('patrol-reddit', `Failed to fetch r/${sub}`);
    return [];
  }
}

export const redditSource: PatrolSource = {
  name: 'reddit',

  async fetch(topics: string[]): Promise<PatrolItem[]> {
    const subs = topics.length > 0
      ? topics.filter((t) => !t.includes(' ')) // assume single-word = subreddit name
      : DEFAULT_SUBS;

    if (subs.length === 0) return [];

    const results = await Promise.allSettled(subs.map(fetchSubreddit));
    const items: PatrolItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(...r.value);
    }

    logger.info('patrol-reddit', `Fetched ${items.length} posts from ${subs.length} subs`);
    return items;
  },
};
