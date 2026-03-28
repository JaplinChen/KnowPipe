/** Shared types for multi-platform patrol sources. */

export interface PatrolItem {
  url: string;
  title: string;
  description: string;
  score?: number;      // platform-specific score (upvotes, points, etc.)
  source: string;      // e.g. 'hn', 'reddit', 'devto', 'github-trending'
  publishedAt?: string; // ISO date string
}

export interface PatrolSource {
  readonly name: string;
  /** Fetch items from this source. Returns raw items (no dedup/filtering). */
  fetch(topics: string[]): Promise<PatrolItem[]>;
}
