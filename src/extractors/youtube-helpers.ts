/**
 * YouTube extractor helper functions — shared text builders and formatters.
 * Extracted from youtube-extractor.ts to stay within 300-line limit.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface YtDlpOutput {
  id: string;
  title: string;
  description?: string;
  uploader?: string;
  channel?: string;
  upload_date?: string;
  thumbnail?: string;
  duration_string?: string;
  view_count?: number;
  like_count?: number;
  tags?: string[];
  webpage_url: string;
}

export interface YtDlpPlaylistEntry {
  id: string;
  title: string;
  url: string;
  webpage_url?: string;
  duration?: number;
  duration_string?: string;
  view_count?: number;
  thumbnail?: string;
  description?: string;
  upload_date?: string;
}

export interface YtDlpPlaylistOutput {
  title: string;
  uploader?: string;
  channel?: string;
  description?: string;
  webpage_url: string;
  entries: YtDlpPlaylistEntry[];
}

export function formatDate(uploadDate?: string): string {
  if (!uploadDate || uploadDate.length !== 8) return new Date().toISOString().split('T')[0];
  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Build Markdown text from single video metadata */
export function buildVideoText(data: YtDlpOutput): string {
  const lines: string[] = [];
  if (data.duration_string) lines.push(`**Duration:** ${data.duration_string}`);
  const stats: string[] = [];
  if (data.view_count != null) stats.push(`Views: ${data.view_count.toLocaleString()}`);
  if (stats.length > 0) lines.push(`**Stats:** ${stats.join(' | ')}`);
  if (data.tags && data.tags.length > 0) {
    lines.push(`**Tags:** ${data.tags.slice(0, 10).join(', ')}`);
  }
  lines.push('');
  if (data.description) {
    const desc = data.description.length > 2000
      ? data.description.slice(0, 2000) + '\n...'
      : data.description;
    lines.push('## Description', '', desc);
  }
  return lines.join('\n');
}

/** Clean video description: remove promo links, timestamps, social media spam */
export function cleanDescription(desc?: string): string {
  if (!desc) return '';
  const lines = desc.split('\n').filter(line => {
    const t = line.trim();
    if (!t) return false;
    if (/^👉|^🔗|^📌|^▶/.test(t)) return false;
    if (/facebook\.com|instagram\.com|substack\.com|twitter\.com|x\.com|linktr\.ee/i.test(t)) return false;
    if (/訂閱|subscribe|追蹤|follow/i.test(t)) return false;
    if (/^\d{1,2}:\d{2}/.test(t)) return false;
    if (/^[-=_]{3,}$/.test(t)) return false;
    return true;
  });
  const cleaned = lines.join('\n').trim();
  return cleaned.length > 500 ? cleaned.slice(0, 500) + '...' : cleaned;
}

/** Build Markdown text from playlist metadata */
export function buildPlaylistText(data: YtDlpPlaylistOutput): string {
  const lines: string[] = [];
  lines.push(`**影片數量：** ${data.entries.length}`);
  lines.push('');
  for (let i = 0; i < data.entries.length; i++) {
    const e = data.entries[i];
    const dur = e.duration_string ?? formatDuration(e.duration);
    const durStr = dur ? ` (${dur})` : '';
    lines.push(`### ${i + 1}. ${e.title}${durStr}`, '');
    lines.push(`{{VIDEO:${i}}}`, '');
    const summary = cleanDescription(e.description);
    if (summary) lines.push(summary, '');
  }
  return lines.join('\n');
}

/**
 * Fetch YouTube transcript using Defuddle CLI as fallback.
 * Defuddle can extract YouTube transcripts with timestamps and chapters.
 */
export async function fetchTranscriptWithDefuddle(url: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('npx', ['defuddle', 'parse', url, '--json'], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const data = JSON.parse(stdout) as { contentMarkdown?: string };
    const md = data.contentMarkdown || '';
    // Defuddle returns transcript as Markdown — extract text content
    if (md.length >= 50) return md;
    return null;
  } catch {
    return null;
  }
}
