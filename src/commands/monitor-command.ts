/**
 * /monitor command — cross-platform keyword search (mention discovery).
 * /google command — web search (DuckDuckGo HTML + Camoufox fallback).
 */
import type { Context } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import { searchReddit, webSearch, fetchJinaContent } from '../utils/search-service.js';
import { saveToVault } from '../saver.js';
import { classifyContent } from '../classifier.js';

/** Hosts excluded from /monitor results (auth-required, content not accessible). */
const MONITOR_SKIP_HOSTS = new Set([
  'x.com', 'twitter.com', 'www.x.com', 'www.twitter.com',
]);

export async function handleMonitor(ctx: Context, config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const keyword = text.replace(/^\/monitor\s*/i, '').trim();

  if (!keyword) {
    await ctx.reply('用法：/monitor <關鍵字>\n例：/monitor claude code');
    return;
  }

  const status = await ctx.reply(`正在跨平台搜尋「${keyword}」...`);

  try {
    const [redditResults, webResults] = await Promise.allSettled([
      searchReddit(keyword, 5),
      webSearch(keyword, 8),
    ]);

    const posts = redditResults.status === 'fulfilled' ? redditResults.value : [];
    const rawWeb = webResults.status === 'fulfilled' ? webResults.value : [];

    const filtered = rawWeb.filter(g => {
      try { return !MONITOR_SKIP_HOSTS.has(new URL(g.url).hostname); }
      catch { return false; }
    });

    const jinaTexts = await Promise.all(
      filtered.map(g => fetchJinaContent(g.url).catch(() => '')),
    );
    for (const [i, g] of filtered.entries()) {
      posts.push({
        platform: 'web',
        author: new URL(g.url).hostname,
        authorHandle: new URL(g.url).hostname,
        title: g.title,
        text: jinaTexts[i] || g.snippet,
        images: [],
        videos: [],
        date: new Date().toISOString().split('T')[0],
        url: g.url,
      });
    }

    if (posts.length === 0) {
      await ctx.reply(`沒有找到關於「${keyword}」的內容。`);
      return;
    }

    let saved = 0;
    for (const post of posts) {
      try {
        post.category = classifyContent(post.title, post.text);
        const r = await saveToVault(post, config.vaultPath);
        if (!r.duplicate) saved++;
      } catch { /* skip */ }
    }

    const lines = [`🔍 搜尋「${keyword}」完成：找到 ${posts.length} 筆，儲存 ${saved} 篇`, ''];
    for (const p of posts.slice(0, 8)) {
      lines.push(`• [${p.title.slice(0, 50)}](${p.url})`);
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`搜尋失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}

export async function handleSearch(ctx: Context, _config: AppConfig): Promise<void> {
  const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
  const query = text.replace(/^\/(search|google)\s*/i, '').trim();

  if (!query) {
    await ctx.reply('用法：/search <查詢>\n例：/search camoufox typescript');
    return;
  }

  const status = await ctx.reply(`正在搜尋「${query}」...`);
  try {
    const results = await webSearch(query, 5);
    if (results.length === 0) {
      await ctx.reply('沒有找到搜尋結果，請稍後再試。');
      return;
    }

    const lines = [`🔍 搜尋「${query}」前 ${results.length} 筆：`, ''];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`${i + 1}. [${r.title}](${r.url})`);
      if (r.snippet) lines.push(`   _${r.snippet.slice(0, 100)}_`);
    }
    lines.push('', '💡 將上方連結傳給我即可儲存到 Obsidian。');
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`搜尋失敗：${msg}`);
  } finally {
    await ctx.deleteMessage(status.message_id).catch(() => {});
  }
}
