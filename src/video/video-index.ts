/**
 * Video index — scans vault for video notes, parses chapters and transcripts.
 * In-memory cache with 30-minute TTL (same pattern as saver.ts urlIndex).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../core/logger.js';
import { VAULT_SUBFOLDER } from '../utils/config.js';

export interface VideoChapter {
  time: string;
  title: string;
  summary: string;
}

export interface VideoIndexEntry {
  filePath: string;
  title: string;
  platform: string;
  date: string;
  url: string;
  keywords: string[];
  chapters: VideoChapter[];
  transcriptSnippet: string;
}

const VIDEO_PLATFORMS = new Set(['YouTube', 'Bilibili', 'TikTok', 'Douyin', '抖音']);
const CACHE_TTL_MS = 30 * 60 * 1000;

let indexCache: VideoIndexEntry[] | null = null;
let cacheBuiltAt = 0;

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      fm[key] = val;
    }
  }
  return fm;
}

function parseKeywords(raw: string): string[] {
  // [keyword1, keyword2, ...]
  const m = raw.match(/\[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(',').map((k) => k.trim()).filter(Boolean);
}

function parseChapters(content: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  // Match chapter table rows: | time | title | summary |
  const tableMatch = content.match(/## 章節[\s\S]*?\n(\|[\s\S]*?\n)(?=\n[^|]|\n$|$)/);
  if (!tableMatch) return chapters;

  const rows = tableMatch[1].split('\n').filter((r) => r.startsWith('|'));
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3 && !cells[0].startsWith('-')) {
      chapters.push({ time: cells[0], title: cells[1], summary: cells[2] });
    }
  }
  return chapters;
}

function extractTranscriptSnippet(content: string): string {
  // Look for transcript section
  const markers = ['## 逐字稿', '## Transcript', '## 轉錄', '[逐字稿]', '[轉錄]'];
  for (const marker of markers) {
    const idx = content.indexOf(marker);
    if (idx >= 0) {
      return content.slice(idx, idx + 500).replace(/\n/g, ' ').trim();
    }
  }
  return '';
}

async function scanDirectory(dir: string, entries: VideoIndexEntry[]): Promise<void> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      await scanDirectory(fullPath, entries);
    } else if (item.name.endsWith('.md')) {
      try {
        const content = await readFile(fullPath, 'utf-8');
        const fm = parseFrontmatter(content);
        if (!fm.source || !VIDEO_PLATFORMS.has(fm.source)) continue;

        entries.push({
          filePath: fullPath,
          title: fm.title ?? item.name,
          platform: fm.source,
          date: fm.date ?? '',
          url: fm.url ?? '',
          keywords: parseKeywords(fm.keywords ?? ''),
          chapters: parseChapters(content),
          transcriptSnippet: extractTranscriptSnippet(content),
        });
      } catch { /* skip unreadable files */ }
    }
  }
}

/** Build or return cached video index. */
export async function getVideoIndex(vaultPath: string): Promise<VideoIndexEntry[]> {
  const now = Date.now();
  if (indexCache && now - cacheBuiltAt < CACHE_TTL_MS) return indexCache;

  const entries: VideoIndexEntry[] = [];
  const obsBotDir = join(vaultPath, VAULT_SUBFOLDER);
  await scanDirectory(obsBotDir, entries);

  indexCache = entries;
  cacheBuiltAt = now;
  logger.info('video-index', `索引建立完成: ${entries.length} 支影片`);
  return entries;
}

/** Invalidate cache (e.g., after new video saved). */
export function invalidateVideoIndex(): void {
  indexCache = null;
}
