/**
 * YouTube extractor — yt-dlp primary, InnerTube API fallback (no install needed).
 * Supports: single videos, shorts, embeds, and playlists.
 */
import { execFile } from 'node:child_process';
import { logger } from '../core/logger.js';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import type { ExtractedContent, Extractor, ChapterInfo } from './types.js';
import { getTimedTranscript, formatTimestamp } from '../utils/transcript-service.js';
import { fetchInnerTubeMeta, fetchInnerTubeTranscript } from '../utils/innertube-service.js';
import { extractPlaylist } from './youtube-playlist.js';
import { detectChaptersFromTranscript } from '../utils/chapter-detector.js';
import { retry } from '../utils/fetch-with-timeout.js';

const execFileAsync = promisify(execFile);

const VIDEO_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const PLAYLIST_PATTERN = /youtube\.com\/playlist\?(?:.*&)?list=([\w-]+)/i;

interface YtDlpOutput {
  id: string;
  title: string;
  description?: string;
  uploader?: string;
  channel?: string;
  upload_date?: string;
  thumbnail?: string;
  duration_string?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  tags?: string[];
  webpage_url: string;
  chapters?: Array<{ start_time: number; end_time: number; title: string }>;
}

function formatDate(uploadDate?: string): string {
  if (!uploadDate || uploadDate.length !== 8) return new Date().toISOString().split('T')[0];
  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
}

function buildVideoText(data: YtDlpOutput): string {
  const lines: string[] = [];
  if (data.duration_string) lines.push(`**Duration:** ${data.duration_string}`);
  const stats: string[] = [];
  if (data.view_count != null) stats.push(`Views: ${data.view_count.toLocaleString()}`);
  if (stats.length > 0) lines.push(`**Stats:** ${stats.join(' | ')}`);
  if (data.tags && data.tags.length > 0) lines.push(`**Tags:** ${data.tags.slice(0, 10).join(', ')}`);
  lines.push('');
  if (data.description) {
    const desc = data.description.length > 2000 ? data.description.slice(0, 2000) + '\n...' : data.description;
    lines.push('## Description', '', desc);
  }
  return lines.join('\n');
}

async function fetchSubtitles(url: string, dir: string): Promise<string | null> {
  try {
    await execFileAsync('yt-dlp', [
      '--skip-download', '--write-auto-sub', '--sub-lang', 'zh-Hant,zh-TW,zh,en',
      '--convert-subs', 'srt', '-o', join(dir, 'subs'), '--no-playlist', '--no-warnings', url,
    ], { timeout: 30_000 });
    const files = await readdir(dir);
    const srt = files.find(f => f.startsWith('subs.') && f.endsWith('.srt'));
    if (!srt) return null;
    const text = (await readFile(join(dir, srt), 'utf-8'))
      .split(/\r?\n/)
      .filter(l => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes('-->'))
      .map(l => l.replace(/<[^>]+>/g, '').trim())
      .filter((l, i, a) => l && (i === 0 || l !== a[i - 1]))
      .join(' ').replace(/\s+/g, ' ').trim();
    return text.length >= 50 ? text : null;
  } catch { return null; }
}

/** Extract via yt-dlp (primary path). Throws if yt-dlp is not installed or fails. */
async function extractVideoViaYtDlp(url: string): Promise<ExtractedContent> {
  let stdout: string;
  try {
    stdout = await retry(async () => {
      const result = await execFileAsync('yt-dlp', [
        '--dump-json', '--no-playlist', '--no-warnings', url,
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });
      return result.stdout;
    }, 3, 1000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) throw new Error('YTDLP_NOT_FOUND');
    throw new Error(`yt-dlp failed: ${msg}`);
  }

  const data = JSON.parse(stdout) as YtDlpOutput;
  const uploader = data.channel ?? data.uploader ?? 'Unknown';
  const tmpDir = join(tmpdir(), `knowpipe-yt-${data.id}`);
  await mkdir(tmpDir, { recursive: true });
  const videoPath = join(tmpDir, 'video.mp4');

  let localPath: string | undefined;
  try {
    await execFileAsync('yt-dlp', [
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4', '-o', videoPath,
      '--no-playlist', '--no-warnings', url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    localPath = videoPath;
  } catch (err) {
    logger.warn('youtube', 'video download failed', { message: String(err).slice(0, 200) });
  }

  let transcript = await fetchSubtitles(url, tmpDir);
  let timedTranscript: ExtractedContent['timedTranscript'];

  if (!transcript && localPath) {
    logger.info('youtube', 'no platform subtitles, trying whisper STT');
    const result = await getTimedTranscript(localPath, tmpDir);
    if (result) { transcript = result.fullText; timedTranscript = result.segments; }
  }

  let chapters: ChapterInfo[] | undefined;
  if (data.chapters && data.chapters.length > 0) {
    chapters = data.chapters.map(ch => ({
      startTime: formatTimestamp(ch.start_time),
      endTime: formatTimestamp(ch.end_time),
      title: ch.title,
    }));
  }
  if (!chapters && timedTranscript && timedTranscript.length > 0) {
    const synthetic = detectChaptersFromTranscript(timedTranscript);
    if (synthetic.length > 0) chapters = synthetic;
  }

  if (!localPath) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  return {
    platform: 'youtube', author: uploader, authorHandle: uploader,
    title: data.title, text: buildVideoText(data),
    images: data.thumbnail ? [data.thumbnail] : [],
    videos: [{ url: data.webpage_url, type: 'video' as const, localPath }],
    date: formatDate(data.upload_date), url,
    transcript: transcript ?? undefined, timedTranscript, chapters,
    tempDir: localPath ? tmpDir : undefined,
  };
}

/** Extract via InnerTube API (fallback when yt-dlp is not installed). */
async function extractVideoViaInnerTube(videoId: string, url: string): Promise<ExtractedContent> {
  logger.info('youtube', 'falling back to InnerTube API', { videoId });

  const meta = await fetchInnerTubeMeta(videoId);
  if (!meta) throw new Error(`InnerTube: could not fetch metadata for ${videoId}`);

  const totalSec = meta.lengthSeconds;
  const durationStr = totalSec > 0
    ? `${Math.floor(totalSec / 3600) > 0 ? `${Math.floor(totalSec / 3600)}:` : ''}${String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`
    : undefined;

  const lines: string[] = [];
  if (durationStr) lines.push(`**Duration:** ${durationStr}`);
  if (meta.viewCount > 0) lines.push(`**Stats:** Views: ${meta.viewCount.toLocaleString()}`);
  if (meta.tags && meta.tags.length > 0) lines.push(`**Tags:** ${meta.tags.join(', ')}`);
  if (meta.description) lines.push('', '## Description', '', meta.description);

  logger.info('youtube', 'InnerTube fallback: no captions available (yt-dlp required for transcripts)');

  return {
    platform: 'youtube',
    author: meta.author,
    authorHandle: meta.author,
    title: meta.title,
    text: lines.join('\n'),
    images: meta.thumbnail ? [meta.thumbnail] : [],
    videos: [{ url, type: 'video' as const }],
    date: meta.publishDate ?? new Date().toISOString().split('T')[0],
    url,
    extraTags: meta.tags,
  };
}

async function extractVideo(url: string): Promise<ExtractedContent> {
  try {
    return await extractVideoViaYtDlp(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'YTDLP_NOT_FOUND') {
      const videoId = url.match(VIDEO_PATTERN)?.[1];
      if (!videoId) throw new Error('Cannot parse YouTube video ID from URL');
      return extractVideoViaInnerTube(videoId, url);
    }
    throw err;
  }
}

export const youtubeExtractor: Extractor = {
  platform: 'youtube',
  match: (url: string) => VIDEO_PATTERN.test(url) || PLAYLIST_PATTERN.test(url),
  parseId(url: string): string | null {
    return url.match(VIDEO_PATTERN)?.[1] ?? url.match(PLAYLIST_PATTERN)?.[1] ?? null;
  },
  async extract(url: string): Promise<ExtractedContent> {
    return PLAYLIST_PATTERN.test(url) ? extractPlaylist(url) : extractVideo(url);
  },
};
