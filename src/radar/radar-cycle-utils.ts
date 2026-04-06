/** Radar cycle utility functions — summary building and display labels. */
import type { RadarResult, RadarCycleSummary, RadarQueryType } from './radar-types.js';

/** Build cycle summary for proactive digest integration. */
export function buildCycleSummary(results: RadarResult[]): RadarCycleSummary {
  const byType: Partial<Record<RadarQueryType, number>> = {};
  let totalSaved = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalQueued = 0;

  for (const r of results) {
    const qType = r.query.type ?? 'search';
    byType[qType] = (byType[qType] ?? 0) + r.saved;
    totalSaved += r.saved;
    totalSkipped += r.skipped;
    totalErrors += r.errors;
    totalQueued += r.queued;
  }

  return { timestamp: new Date().toISOString(), totalSaved, totalSkipped, totalErrors, totalQueued, byType };
}

/** Format source type label for display. */
export function sourceLabel(type: RadarQueryType, customName?: string): string {
  switch (type) {
    case 'github': return 'GitHub';
    case 'rss': return 'RSS';
    case 'hn': return 'HN';
    case 'devto': return 'Dev.to';
    case 'custom': return customName ? `🔌 ${customName}` : '自訂';
    default: return '搜尋';
  }
}
