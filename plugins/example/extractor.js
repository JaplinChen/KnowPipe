/**
 * Example plugin extractor — demonstrates the plugin API.
 * This is a reference implementation; replace with real extraction logic.
 */

/** @type {import('../../src/plugins/plugin-types.js').PluginExtractor} */
const extractor = {
  init(ctx) {
    ctx.log.info('Example plugin initialized');
  },

  match(url) {
    return url.includes('example.com');
  },

  async extract(url, ctx) {
    ctx.log.info(`Extracting: ${url}`);

    const res = await ctx.fetchWithTimeout(url);
    const html = await res.text();

    // Extract title from HTML
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'Example Page';

    return {
      platform: 'web',
      author: '',
      authorHandle: '',
      title,
      text: `Content extracted from ${url} by example plugin.`,
      images: [],
      videos: [],
      date: new Date().toISOString().split('T')[0],
      url,
    };
  },
};

export default extractor;
