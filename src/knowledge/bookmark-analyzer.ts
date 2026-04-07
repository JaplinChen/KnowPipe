/**
 * Bookmark Gap Analyzer — compares local X bookmarks SQLite database
 * against vault-knowledge.json to find under-explored topics.
 * Gracefully handles missing DB with install instructions.
 */
import { join } from 'node:path';
import { loadKnowledge } from './knowledge-store.js';
import { saveReportToVault } from './report-saver.js';
import { logger } from '../core/logger.js';

export interface BookmarkGapResult {
  savedPath?: string;
  bookmarkCount: number;
  gapCount: number;
  error?: string;
}

interface BookmarkRow {
  title?: string;
  url?: string;
  full_text?: string;
}

interface TopicGap {
  topic: string;
  bookmarkCount: number;
  vaultCount: number;
  gap: number;
  examples: string[];
}

const DB_SEARCH_PATHS = [
  join(process.env.HOME ?? '~', '.x-bookmarks', 'bookmarks.db'),
  join(process.env.HOME ?? '~', 'Library', 'Application Support', 'x-bookmarks', 'bookmarks.db'),
  join(process.env.HOME ?? '~', '.config', 'x-bookmarks', 'bookmarks.db'),
];

async function tryLoadBookmarks(): Promise<BookmarkRow[] | null> {
  for (const dbPath of DB_SEARCH_PATHS) {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare('SELECT title, url, full_text FROM bookmarks LIMIT 500').all() as BookmarkRow[];
      db.close();
      if (rows.length > 0) return rows;
    } catch { /* try next */ }
  }
  return null;
}

function extractTopicFrequency(bookmarks: BookmarkRow[]): Map<string, string[]> {
  const topicExamples = new Map<string, string[]>();
  const stopWords = new Set(['the', 'a', 'an', 'is', 'in', 'of', 'to', 'and', 'for',
    '的', '了', '是', '在', '和', '有', '與', '用', '我', '你', '他']);

  for (const bm of bookmarks) {
    const text = `${bm.title ?? ''} ${bm.full_text ?? ''}`;
    const words = text
      .split(/[\s，。、：；！？\n]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 2 && w.length <= 20 && !stopWords.has(w.toLowerCase()));

    for (const word of words.slice(0, 12)) {
      if (!topicExamples.has(word)) topicExamples.set(word, []);
      const ex = topicExamples.get(word)!;
      if (ex.length < 3 && bm.title) ex.push(bm.title.slice(0, 40));
    }
  }
  return topicExamples;
}

export async function analyzeBookmarkGaps(vaultPath: string): Promise<BookmarkGapResult> {
  const today = new Date().toISOString().split('T')[0];
  const bookmarks = await tryLoadBookmarks();

  if (!bookmarks) {
    const instructions = [
      '## 找不到 X 書籤資料庫',
      '',
      '請先安裝並執行 X 書籤本地化 CLI 工具同步書籤：',
      '',
      '```bash',
      'npx x-bookmarks-cli sync',
      '```',
      '',
      '**預設搜尋路徑：**',
      ...DB_SEARCH_PATHS.map(p => `- \`${p}\``),
      '',
      '同步完成後再執行 `/vault bookmark-gap` 進行分析。',
    ].join('\n');

    const savedPath = await saveReportToVault(vaultPath, {
      title: `Bookmark Gap — 尚未同步`,
      date: today,
      content: instructions,
      tags: ['bookmark-gap', 'auto-generated'],
      filePrefix: 'bookmark-gap',
      tool: 'bookmark-gap',
    });
    return { savedPath, bookmarkCount: 0, gapCount: 0, error: '找不到書籤資料庫' };
  }

  const knowledge = await loadKnowledge();
  const vaultEntityCount = new Map(
    Object.values(knowledge.globalEntities ?? {}).map(e => [e.name.toLowerCase(), e.mentions]),
  );

  const topicMap = extractTopicFrequency(bookmarks);
  const gaps: TopicGap[] = [];

  for (const [topic, examples] of topicMap) {
    const topicLower = topic.toLowerCase();
    const bookmarkCount = bookmarks.filter(b =>
      (b.title ?? '').toLowerCase().includes(topicLower) ||
      (b.full_text ?? '').toLowerCase().includes(topicLower),
    ).length;
    if (bookmarkCount < 3) continue;

    const vaultCount = vaultEntityCount.get(topicLower) ?? 0;
    const gap = bookmarkCount - vaultCount * 2;
    if (gap > 0) gaps.push({ topic, bookmarkCount, vaultCount, gap, examples });
  }

  gaps.sort((a, b) => b.gap - a.gap);
  const topGaps = gaps.slice(0, 15);

  const tableRows = topGaps.map(g => `| ${g.topic} | ${g.bookmarkCount} | ${g.vaultCount} | +${g.gap} |`);

  const deepDive = topGaps.slice(0, 5).map(g =>
    `### ${g.topic}\n書籤 ${g.bookmarkCount} 條，Vault 僅 ${g.vaultCount} 篇。\n` +
    `範例書籤：${g.examples.join('、')}\n`,
  );

  const content = [
    `## 分析結果\n`,
    `- 書籤總數：${bookmarks.length} 條`,
    `- 發現知識缺口：${topGaps.length} 個主題`,
    '',
    '## 高頻但 Vault 覆蓋不足的主題\n',
    '| 主題 | 書籤數 | Vault 筆記 | 缺口 |',
    '|------|--------|------------|------|',
    ...tableRows,
    '',
    '## 建議深挖主題\n',
    ...deepDive,
  ].join('\n');

  const savedPath = await saveReportToVault(vaultPath, {
    title: `Bookmark Gap Analysis — ${today}`,
    date: today,
    content,
    tags: ['bookmark-gap', 'knowledge-graph', 'auto-generated'],
    filePrefix: 'bookmark-gap',
    subtitle: `${bookmarks.length} 條書籤，${topGaps.length} 個知識缺口`,
    tool: 'bookmark-gap',
  });

  logger.info('bookmark-gap', '書籤分析完成', { bookmarks: bookmarks.length, gaps: topGaps.length });
  return { savedPath, bookmarkCount: bookmarks.length, gapCount: topGaps.length };
}
