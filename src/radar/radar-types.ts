/** Content radar — type definitions */

/** Source type for a radar query. */
export type RadarQueryType = 'search' | 'github' | 'rss' | 'hn' | 'reddit' | 'devto';

export interface RadarConfig {
  version: number;
  enabled: boolean;
  intervalHours: number;
  maxResultsPerQuery: number;
  maxTotalPerCycle: number;
  queries: RadarQuery[];
  lastRunAt?: string;
  /** Per-cycle results kept for proactive digest integration. */
  lastCycleResults?: RadarCycleSummary;
}

export interface RadarQuery {
  id: string;
  /** Query type: 'search' (DDG), 'github' (trending), 'rss' (feed). */
  type: RadarQueryType;
  /** search: keywords, github: [language?], rss: [feedUrl]. */
  keywords: string[];
  source: 'auto' | 'manual';
  addedAt: string;
  lastHitCount?: number;
  /** Consecutive fetch failures — auto-paused at 3. */
  consecutiveFailures?: number;
  /** If true, query is paused due to repeated failures. */
  paused?: boolean;
}

export interface RadarResult {
  query: RadarQuery;
  saved: number;
  skipped: number;
  errors: number;
}

/** Summary of a full radar cycle — used by proactive digest. */
export interface RadarCycleSummary {
  timestamp: string;
  totalSaved: number;
  totalSkipped: number;
  totalErrors: number;
  byType: Partial<Record<RadarQueryType, number>>;
}

export function createEmptyConfig(): RadarConfig {
  return {
    version: 1,
    enabled: false,
    intervalHours: 6,
    maxResultsPerQuery: 5,
    maxTotalPerCycle: 20,
    queries: [],
  };
}
