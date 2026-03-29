/**
 * /radar command — manage the content radar.
 * /radar          → show status
 * /radar on|off   → enable/disable
 * /radar add <kw> → add manual query
 * /radar remove <id> → remove query
 * /radar auto     → auto-generate queries from vault
 * /radar run      → manual trigger
 */
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { AppConfig } from '../utils/config.js';
import type { RadarQueryType } from '../radar/radar-types.js';
import { loadRadarConfig, saveRadarConfig, addQuery, removeQuery, autoGenerateQueries } from '../radar/radar-store.js';
import { runRadarCycle } from '../radar/radar-service.js';
import { handleWall } from '../radar/wall-command.js';

function typeIcon(type: RadarQueryType): string {
  switch (type) {
    case 'github': return '🐙';
    case 'rss': return '📡';
    case 'hn': return '🟠';
    case 'reddit': return '🔴';
    case 'devto': return '📝';
    case 'custom': return '🔌';
    default: return '🔍';
  }
}

export async function handleRadar(ctx: Context, config: AppConfig): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') ?? '';
  const arg = text.replace(/^\/radar\s*/, '').trim();
  const radarConfig = await loadRadarConfig();

  // /radar wall [subcommand]
  if (arg.startsWith('wall')) {
    const subArg = arg.slice(4).trim();
    await handleWall(ctx, config, subArg);
    return;
  }

  // /radar (no args) → show status with inline keyboard
  if (!arg) {
    if (radarConfig.queries.length === 0) {
      // First-use guide
      await ctx.reply(
        [
          '🔍 內容雷達',
          '',
          '自動搜尋你關注的主題並存入 Vault。',
          '首次使用請先自動生成查詢（從 Vault 分析關注方向）。',
        ].join('\n'),
        Markup.inlineKeyboard([
          [Markup.button.callback('🤖 自動生成查詢', 'radar:auto')],
          [Markup.button.callback('📖 查看完整用法', 'radar:usage')],
        ]),
      );
      return;
    }

    const status = radarConfig.enabled ? '✅ 啟用' : '⏸️ 停用';
    const lastRun = radarConfig.lastRunAt
      ? new Date(radarConfig.lastRunAt).toLocaleString('zh-TW')
      : '從未執行';
    const lines = [
      `🔍 內容雷達 ${status}`,
      '',
      `查詢數：${radarConfig.queries.length}`,
      `間隔：每 ${radarConfig.intervalHours} 小時`,
      `上次執行：${lastRun}`,
    ];

    lines.push('', '查詢列表：');
    for (const q of radarConfig.queries) {
      const src = q.source === 'auto' ? '🤖' : '✍️';
      const typeTag = typeIcon(q.type ?? 'search');
      const desc = q.type === 'rss'
        ? q.keywords[0]
        : q.type === 'custom'
          ? (q.customConfig?.name ?? '自訂來源')
          : q.keywords.join(' ');
      const hit = q.lastHitCount != null ? ` (${q.lastHitCount}篇)` : '';
      const fail = (q.consecutiveFailures ?? 0) > 0 ? ` ⚠️${q.consecutiveFailures}次失敗` : '';
      const paused = q.paused ? ' ⏸️已暫停' : '';
      lines.push(`${src}${typeTag} [${q.id}] ${desc}${hit}${fail}${paused}`);
    }

    const buttons = [
      [
        Markup.button.callback(radarConfig.enabled ? '⏸️ 停用' : '▶️ 啟用', `radar:toggle`),
        Markup.button.callback('🤖 自動生成', 'radar:auto'),
      ],
      [
        Markup.button.callback('▶️ 立即執行', 'radar:run'),
        Markup.button.callback('➕ 新增來源', 'radar:addsrc'),
      ],
      [Markup.button.callback('🧱 情報牆', 'radar:wall')],
    ];

    await ctx.reply(lines.join('\n'), Markup.inlineKeyboard(buttons));
    return;
  }

  // /radar on
  if (arg === 'on') {
    radarConfig.enabled = true;
    await saveRadarConfig(radarConfig);
    await ctx.reply('✅ 內容雷達已啟用（下次 Bot 重啟時生效）');
    return;
  }

  // /radar off
  if (arg === 'off') {
    radarConfig.enabled = false;
    await saveRadarConfig(radarConfig);
    await ctx.reply('⏸️ 內容雷達已停用');
    return;
  }

  // /radar auto
  if (arg === 'auto') {
    await ctx.reply('🤖 正在從 Vault 自動生成查詢...');
    const added = await autoGenerateQueries(config.vaultPath, radarConfig);
    await saveRadarConfig(radarConfig);

    const lines = [`🤖 已生成 ${added.length} 個查詢：`, ''];
    for (const q of added) {
      lines.push(`• [${q.id}] ${q.keywords.join(' ')}`);
    }
    await ctx.reply(lines.join('\n'));
    return;
  }

  // /radar run
  if (arg === 'run') {
    if (radarConfig.queries.length === 0) {
      await ctx.reply('❌ 沒有查詢，請先 /radar auto 或 /radar add <關鍵字>');
      return;
    }
    await ctx.reply(`🔍 開始掃描 ${radarConfig.queries.length} 個查詢...`);
    // Use a minimal bot-like object for notification
    const results = await runRadarCycle(ctx as never, config, radarConfig);
    const saved = results.reduce((s, r) => s + r.saved, 0);
    if (saved === 0) {
      await ctx.reply('📭 本次掃描沒有發現新內容（全部已存在或無結果）');
    }
    return;
  }

  // /radar resume <id> — resume a paused query
  if (arg.startsWith('resume ')) {
    const id = arg.slice(7).trim();
    const query = radarConfig.queries.find(q => q.id === id);
    if (!query) {
      await ctx.reply(`❌ 找不到查詢 [${id}]`);
      return;
    }
    query.paused = false;
    query.consecutiveFailures = 0;
    await saveRadarConfig(radarConfig);
    await ctx.reply(`▶️ 查詢 [${id}] 已恢復`);
    return;
  }

  // /radar add hn <topics>
  if (arg.startsWith('add hn')) {
    const topics = arg.slice(6).trim().split(/\s+/).filter(Boolean);
    const query = addQuery(radarConfig, topics.length > 0 ? topics : ['*'], 'manual', 'hn');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 HN 來源 [${query.id}]`);
    return;
  }

  // /radar add reddit <subreddits>
  if (arg.startsWith('add reddit')) {
    const subs = arg.slice(10).trim().split(/\s+/).filter(Boolean);
    const query = addQuery(radarConfig, subs.length > 0 ? subs : ['MachineLearning', 'LocalLLaMA'], 'manual', 'reddit');
    await saveRadarConfig(radarConfig);
    const desc = query.keywords.join(', ');
    await ctx.reply(`✅ 已新增 Reddit 來源 [${query.id}]: ${desc}`);
    return;
  }

  // /radar add devto <tags>
  if (arg.startsWith('add devto')) {
    const tags = arg.slice(9).trim().split(/\s+/).filter(Boolean);
    const query = addQuery(radarConfig, tags.length > 0 ? tags : ['ai', 'typescript'], 'manual', 'devto');
    await saveRadarConfig(radarConfig);
    const desc = query.keywords.join(', ');
    await ctx.reply(`✅ 已新增 Dev.to 來源 [${query.id}]: ${desc}`);
    return;
  }

  // /radar add github <language?>
  if (arg.startsWith('add github')) {
    const lang = arg.slice(10).trim() || '';
    const keywords = lang ? [lang] : [];
    const query = addQuery(radarConfig, keywords, 'manual', 'github');
    await saveRadarConfig(radarConfig);
    const desc = lang || '所有語言';
    await ctx.reply(`✅ 已新增 GitHub Trending [${query.id}]: ${desc}`);
    return;
  }

  // /radar add rss <url>
  if (arg.startsWith('add rss ')) {
    const feedUrl = arg.slice(8).trim();
    if (!feedUrl.startsWith('http')) {
      await ctx.reply('用法: /radar add rss https://example.com/feed.xml');
      return;
    }
    const query = addQuery(radarConfig, [feedUrl], 'manual', 'rss');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增 RSS 來源 [${query.id}]: ${feedUrl}`);
    return;
  }

  // /radar add custom <name> <url> <itemsPath> <urlField> <titleField> [snippetField]
  // Example: /radar add custom "AI News" "https://api.example.com/posts?q={query}" "items" "url" "title" "summary"
  if (arg.startsWith('add custom')) {
    const rest = arg.slice(10).trim();
    // Parse quoted or space-separated tokens
    const tokens: string[] = [];
    const tokenRe = /"([^"]*)"|\S+/g;
    for (const m of rest.matchAll(tokenRe)) {
      tokens.push(m[1] ?? m[0]);
    }
    if (tokens.length < 5) {
      await ctx.reply(
        '用法: /radar add custom <名稱> <url> <itemsPath> <urlField> <titleField> [snippetField]\n\n' +
        '範例:\n' +
        '/radar add custom "AI News" "https://api.ex.com/search?q={query}" "results" "link" "title" "description"\n\n' +
        '說明:\n' +
        '• url: 支援 {query} 佔位符（會被關鍵字取代）\n' +
        '• itemsPath: JSON 回傳中項目陣列的路徑（留空 "" 表示根層陣列）\n' +
        '• urlField / titleField: 每個項目中對應欄位名稱',
      );
      return;
    }
    const [name, url, itemsPath, urlField, titleField, snippetField] = tokens;
    if (!url.startsWith('http')) {
      await ctx.reply('❌ url 必須以 http 開頭');
      return;
    }
    const query = addQuery(radarConfig, [], 'manual', 'custom');
    query.customConfig = { name, url, itemsPath, urlField, titleField, snippetField };
    await saveRadarConfig(radarConfig);
    await ctx.reply(
      `✅ 已新增自訂來源 [${query.id}]: ${name}\n` +
      `• URL: ${url.slice(0, 60)}${url.length > 60 ? '…' : ''}\n` +
      `• 解析: items=${itemsPath || '根'} / url=${urlField} / title=${titleField}`,
    );
    return;
  }

  // /radar add <keywords>
  if (arg.startsWith('add ')) {
    const keywords = arg.slice(4).trim().split(/\s+/);
    if (keywords.length === 0) {
      await ctx.reply('用法: /radar add <關鍵字1> <關鍵字2> ...');
      return;
    }
    const query = addQuery(radarConfig, keywords, 'manual', 'search');
    await saveRadarConfig(radarConfig);
    await ctx.reply(`✅ 已新增查詢 [${query.id}]: ${keywords.join(' ')}`);
    return;
  }

  // /radar remove <id>
  if (arg.startsWith('remove ')) {
    const id = arg.slice(7).trim();
    if (removeQuery(radarConfig, id)) {
      await saveRadarConfig(radarConfig);
      await ctx.reply(`✅ 已移除查詢 [${id}]`);
    } else {
      await ctx.reply(`❌ 找不到查詢 [${id}]`);
    }
    return;
  }

  await ctx.reply(
    '用法:\n' +
    '/radar — 查看狀態\n' +
    '/radar on|off — 啟用/停用\n' +
    '/radar add <關鍵字> — 新增搜尋查詢（DDG）\n' +
    '/radar add hn [主題] — 新增 HN 來源\n' +
    '/radar add reddit [subreddits] — 新增 Reddit 來源\n' +
    '/radar add devto [tags] — 新增 Dev.to 來源\n' +
    '/radar add github [語言] — 新增 GitHub Trending\n' +
    '/radar add rss <URL> — 新增 RSS 來源\n' +
    '/radar add custom <名稱> <url> <itemsPath> <urlField> <titleField> — 新增 JSON API 自訂來源\n' +
    '/radar remove <id> — 移除查詢\n' +
    '/radar resume <id> — 恢復暫停的查詢\n' +
    '/radar auto — 從 Vault 自動生成\n' +
    '/radar run — 立即執行\n' +
    '/radar wall — 工具情報牆',
  );
}

export { handleRadarAction } from './radar-callbacks.js';
