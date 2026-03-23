/**
 * YouTube extractor — uses yt-dlp to fetch video/playlist metadata.
 * Supports: single videos, shorts, embeds, and playlists.
 * Requires yt-dlp installed: https://github.com/yt-dlp/yt-dlp#installation
 */
import { execFile } from 'node:child_process';
import { logger } from '../core/logger.js';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm, access, readFile, readdir } from 'node:fs/promises';
import type { ExtractedContent, Extractor, VideoInfo } from './types.js';
import {
  buildVideoText, buildPlaylistText, formatDate, fetchTranscriptWithDefuddle,
} from './youtube-helpers.js';
import type { YtDlpOutput, YtDlpPlaylistOutput } from './youtube-helpers.js';

const execFileAsync = promisify(execFile);

const VIDEO_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const PLAYLIST_PATTERN = /youtube\.com\/playlist\?(?:.*&)?list=([\w-]+)/i;

function isPlaylistUrl(url: string): boolean {
  return PLAYLIST_PATTERN.test(url);
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

async function extractVideo(url: string): Promise<ExtractedContent> {
  let stdout: string;
  try {
    const result = await execFileAsync('yt-dlp', [
      '--dump-json', '--no-playlist', '--no-warnings', url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });
    stdout = result.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      throw new Error(
        'yt-dlp is not installed. Install it from https://github.com/yt-dlp/yt-dlp#installation',
      );
    }
    throw new Error(`yt-dlp failed: ${msg}`);
  }

  const data = JSON.parse(stdout) as YtDlpOutput;
  const uploader = data.channel ?? data.uploader ?? 'Unknown';

  const tmpDir = join(tmpdir(), `getthreads-yt-${data.id}`);
  await mkdir(tmpDir, { recursive: true });
  const videoPath = join(tmpDir, 'video.mp4');

  let localPath: string | undefined;
  try {
    await execFileAsync('yt-dlp', [
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', videoPath,
      '--no-playlist', '--no-warnings', url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    localPath = videoPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('youtube', 'video download failed', { message: msg.slice(0, 200) });
  }

  // Fetch subtitles: yt-dlp first, Defuddle CLI as fallback
  let transcript = await fetchSubtitles(url, tmpDir);
  if (!transcript) {
    transcript = await fetchTranscriptWithDefuddle(url);
  }

  if (!localPath) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    platform: 'youtube',
    author: uploader,
    authorHandle: uploader,
    title: data.title,
    text: buildVideoText(data),
    images: data.thumbnail ? [data.thumbnail] : [],
    videos: [{ url: data.webpage_url, type: 'video' as const, localPath }],
    date: formatDate(data.upload_date),
    url,
    transcript: transcript ?? undefined,
    tempDir: localPath ? tmpDir : undefined,
  };
}

async function extractPlaylist(url: string): Promise<ExtractedContent> {
  let stdout: string;
  try {
    const result = await execFileAsync('yt-dlp', [
      '--dump-single-json', '--no-warnings', url,
    ], { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 });
    stdout = result.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      throw new Error(
        'yt-dlp is not installed. Install it from https://github.com/yt-dlp/yt-dlp#installation',
      );
    }
    throw new Error(`yt-dlp failed: ${msg}`);
  }

  const data = JSON.parse(stdout) as YtDlpPlaylistOutput;
  const uploader = data.channel ?? data.uploader ?? 'Unknown';

  const tmpDir = join(tmpdir(), `getthreads-yt-pl-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  const videos: VideoInfo[] = [];
  try {
    await execFileAsync('yt-dlp', [
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', join(tmpDir, '%(playlist_index)s.mp4'),
      '--no-warnings', url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 });

    for (let i = 0; i < data.entries.length; i++) {
      const videoFile = join(tmpDir, `${i + 1}.mp4`);
      try {
        await access(videoFile);
        videos.push({
          url: data.entries[i].webpage_url ?? data.entries[i].url,
          type: 'video' as const,
          localPath: videoFile,
        });
      } catch { /* file not downloaded */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('youtube', 'playlist video download failed', { message: msg.slice(0, 200) });
  }

  return {
    platform: 'youtube',
    author: uploader,
    authorHandle: uploader,
    title: data.title,
    text: buildPlaylistText(data),
    images: [],
    videos,
    date: new Date().toISOString().split('T')[0],
    url,
    tempDir: videos.length > 0 ? tmpDir : undefined,
  };
}

export const youtubeExtractor: Extractor = {
  platform: 'youtube',

  match(url: string): boolean {
    return VIDEO_PATTERN.test(url) || PLAYLIST_PATTERN.test(url);
  },

  parseId(url: string): string | null {
    const videoMatch = url.match(VIDEO_PATTERN);
    if (videoMatch) return videoMatch[1];
    const playlistMatch = url.match(PLAYLIST_PATTERN);
    return playlistMatch?.[1] ?? null;
  },

  async extract(url: string): Promise<ExtractedContent> {
    return isPlaylistUrl(url) ? extractPlaylist(url) : extractVideo(url);
  },
};
