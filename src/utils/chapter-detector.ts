/**
 * Heuristic chapter detection from timed transcript segments.
 * Groups segments into ~2-minute windows and extracts a title from
 * the first meaningful sentence in each window.
 * Used as fallback when a video has no native platform chapters.
 */
import type { TranscriptSegment } from '../extractors/types.js';
import type { ChapterInfo } from '../extractors/types.js';

/** Window size in seconds for synthetic chapter grouping. */
const WINDOW_SECONDS = 120;

/** Minimum number of windows to produce a chapter list. */
const MIN_CHAPTERS = 3;

/** Maximum characters for a synthetic chapter title. */
const MAX_TITLE_LEN = 40;

/** Format seconds as HH:MM:SS string. */
function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

/** Trim a text snippet to a natural sentence boundary. */
function trimToTitle(text: string): string {
  const clean = text.replace(/[^\w\s\u4e00-\u9fff\u3040-\u30ff]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE_LEN) return clean;
  // Cut at word boundary
  const cut = clean.slice(0, MAX_TITLE_LEN);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > MAX_TITLE_LEN * 0.5 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Detect synthetic chapters from Whisper timed transcript.
 * Returns empty array when the transcript is too short or sparse.
 */
export function detectChaptersFromTranscript(
  segments: TranscriptSegment[],
): ChapterInfo[] {
  if (segments.length === 0) return [];

  const totalDuration = segments[segments.length - 1].end;
  // Skip very short videos (< MIN_CHAPTERS * WINDOW_SECONDS)
  if (totalDuration < MIN_CHAPTERS * WINDOW_SECONDS) return [];

  const chapters: ChapterInfo[] = [];
  let windowStart = 0;
  let windowSegments: TranscriptSegment[] = [];

  const flush = (): void => {
    if (windowSegments.length === 0) return;
    const text = windowSegments.map(s => s.text.trim()).join(' ');
    const title = trimToTitle(text);
    if (title.length < 3) return;
    const endSec = windowSegments[windowSegments.length - 1].end;
    chapters.push({
      startTime: formatSeconds(windowStart),
      endTime: formatSeconds(endSec),
      title,
    });
    windowStart = endSec;
    windowSegments = [];
  };

  for (const seg of segments) {
    if (seg.start >= windowStart + WINDOW_SECONDS) {
      flush();
      windowStart = seg.start;
    }
    windowSegments.push(seg);
  }
  flush(); // last window

  return chapters.length >= MIN_CHAPTERS ? chapters : [];
}
