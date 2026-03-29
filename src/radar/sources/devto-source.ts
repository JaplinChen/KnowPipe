/**
 * Dev.to source adapter for radar — wraps patrol's devtoSource.
 */
import type { RadarSource, RadarSourceResult } from './source-types.js';
import { devtoSource } from '../../patrol/sources/devto-source.js';

export const radarDevtoSource: RadarSource = {
  type: 'devto',

  async fetch(params: string[], maxResults: number): Promise<RadarSourceResult[]> {
    const items = await devtoSource.fetch(params);
    return items.slice(0, maxResults).map(item => ({
      url: item.url,
      title: item.title,
      snippet: item.description,
    }));
  },
};
