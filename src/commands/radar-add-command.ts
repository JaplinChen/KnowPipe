/**
 * /radar add * sub-commands — source addition handlers.
 * Extracted from radar-command.ts to stay under 300 lines.
 */
import type { Context } from 'telegraf';
import { loadRadarConfig, saveRadarConfig, addQuery } from '../radar/radar-store.js';
import { addAuthorQuery } from '../radar/radar-author.js';

/**
 * Handle all `/radar add *` sub-commands.
 * Returns true if the arg was handled, false if it fell through.
 */
export async function handleRadarAdd(ctx: Context, arg: string): Promise<boolean> {
  const radarConfig = await loadRadarConfig();

  // /radar add author <handle>
  if (arg.startsWith('add author ') || arg === 'add author') {
    const handle = arg.slice(11).trim().replace(/^@/, '');
    if (!handle) { await ctx.reply('用法: /radar add author <作者名稱>'); return true; }
    addAuthorQuery(radarConfig, handle);
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增作者追蹤：${handle}`);
    return true;
  }

  // /radar add topic <topic>
  if (arg.startsWith('add topic ')) {
    const topic = arg.slice(10).trim();
    if (!topic) { await ctx.reply('用法: /radar add topic <主題>'); return true; }
    const keywords = topic.split(/\s+/);
    const query = addQuery(radarConfig, keywords, 'manual', 'search');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增主題監控 [${query.id}]: ${topic}`);
    return true;
  }

  // /radar add hn <topics>
  if (arg.startsWith('add hn')) {
    const topics = arg.slice(6).trim().split(/\s+/).filter(Boolean);
    const query = addQuery(radarConfig, topics.length > 0 ? topics : ['*'], 'manual', 'hn');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 HN 來源 [${query.id}]`);
    return true;
  }

  // /radar add devto <tags>
  if (arg.startsWith('add devto')) {
    const tags = arg.slice(9).trim().split(/\s+/).filter(Boolean);
    const query = addQuery(radarConfig, tags.length > 0 ? tags : ['ai', 'typescript'], 'manual', 'devto');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 Dev.to 來源 [${query.id}]: ${query.keywords.join(', ')}`);
    return true;
  }

  // /radar add github <language?>
  if (arg.startsWith('add github')) {
    const lang = arg.slice(10).trim() || '';
    const query = addQuery(radarConfig, lang ? [lang] : [], 'manual', 'github');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 GitHub Trending [${query.id}]: ${lang || '所有語言'}`);
    return true;
  }

  // /radar add rss <url>
  if (arg.startsWith('add rss ')) {
    const feedUrl = arg.slice(8).trim();
    if (!feedUrl.startsWith('http')) {
      await ctx.reply('用法: /radar add rss https://example.com/feed.xml');
      return true;
    }
    const query = addQuery(radarConfig, [feedUrl], 'manual', 'rss');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 RSS 來源 [${query.id}]: ${feedUrl}`);
    return true;
  }

  // /radar add custom <name> <url> <itemsPath> <urlField> <titleField> [snippetField]
  if (arg.startsWith('add custom')) {
    const rest = arg.slice(10).trim();
    const tokens: string[] = [];
    const tokenRe = /"([^"]*)"|\S+/g;
    for (const m of rest.matchAll(tokenRe)) tokens.push(m[1] ?? m[0]);
    if (tokens.length < 5) {
      await ctx.reply(
        '用法: /radar add custom <名稱> <url> <itemsPath> <urlField> <titleField>\n\n' +
        '範例:\n/radar add custom "AI News" "https://api.ex.com/search?q={query}" "results" "link" "title"\n\n' +
        '• url: 支援 {query} 佔位符\n• itemsPath: JSON 陣列路徑（留空 "" 表示根層）',
      );
      return true;
    }
    const [name, url, itemsPath, urlField, titleField, snippetField] = tokens;
    if (!url.startsWith('http')) { await ctx.reply('❌ url 必須以 http 開頭'); return true; }
    const query = addQuery(radarConfig, [], 'manual', 'custom');
    query.customConfig = { name, url, itemsPath, urlField, titleField, snippetField };
    await saveRadarConfig(radarConfig);
    await ctx.reply(
      `✅ 已新增自訂來源 [${query.id}]: ${name}\n` +
      `• URL: ${url.slice(0, 60)}${url.length > 60 ? '…' : ''}\n` +
      `• 解析: items=${itemsPath || '根'} / url=${urlField} / title=${titleField}`,
    );
    return true;
  }

  // /radar add <keywords> (generic DDG search)
  if (arg.startsWith('add ')) {
    const keywords = arg.slice(4).trim().split(/\s+/);
    if (keywords.length === 0) { await ctx.reply('用法: /radar add <關鍵字1> <關鍵字2> ...'); return true; }
    const query = addQuery(radarConfig, keywords, 'manual', 'search');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增查詢 [${query.id}]: ${keywords.join(' ')}`);
    return true;
  }

  return false;
}
