/**
 * HN source adapter for radar — wraps patrol's hnSource.
 */
import type { RadarSource, RadarSourceResult } from './source-types.js';
import { hnSource } from '../../patrol/sources/hn-source.js';

export const radarHnSource: RadarSource = {
  type: 'hn',

  async fetch(params: string[], maxResults: number): Promise<RadarSourceResult[]> {
    const items = await hnSource.fetch(params);
    return items.slice(0, maxResults).map(item => ({
      url: item.url,
      title: item.title,
      snippet: item.description,
    }));
  },
};
