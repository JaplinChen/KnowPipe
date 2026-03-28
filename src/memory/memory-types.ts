/** Types for user preference memory system. */

export interface SaveEvent {
  userId: number;
  category: string;
  keywords: string[];
  platform: string;
  title: string;
  ts: string; // ISO timestamp
}

export interface PreferenceSummary {
  topCategories: string[];
  preferredPlatforms: string[];
  frequentKeywords: string[];
  description: string; // AI-generated natural language summary
  generatedAt: string;
}

export interface UserMemoryStore {
  events: SaveEvent[];
  summaries: Record<string, PreferenceSummary>; // keyed by userId string
}

export const EMPTY_STORE: UserMemoryStore = { events: [], summaries: {} };
export const SUMMARY_THRESHOLD = 20; // generate summary after N events per user
