/** Types for the automated content patrol service. */

export interface PatrolConfig {
  /** Enable automatic patrol (default: false) */
  enabled: boolean;
  /** Patrol interval in hours (default: 12) */
  intervalHours: number;
  /** Last patrol timestamp */
  lastPatrolAt: string | null;
  /** Languages to filter on GitHub Trending (empty = all) */
  languages: string[];
}

export interface PatrolResult {
  source: string;
  found: number;
  saved: number;
  skipped: number;
}

export const DEFAULT_PATROL_CONFIG: PatrolConfig = {
  enabled: false,
  intervalHours: 12,
  lastPatrolAt: null,
  languages: ['typescript', 'python'],
};
