/**
 * Reddit source adapter for radar — wraps patrol's redditSource.
 */
import type { RadarSource, RadarSourceResult } from './source-types.js';
import { redditSource } from '../../patrol/sources/reddit-source.js';

export const radarRedditSource: RadarSource = {
  type: 'reddit',

  async fetch(params: string[], maxResults: number): Promise<RadarSourceResult[]> {
    const items = await redditSource.fetch(params);
    return items.slice(0, maxResults).map(item => ({
      url: item.url,
      title: item.title,
      snippet: item.description,
    }));
  },
};
