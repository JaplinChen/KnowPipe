/**
 * Video search — two-phase: keyword pre-filter → oMLX semantic ranking.
 */
import type { VideoIndexEntry } from './video-index.js';
import { getVideoIndex } from './video-index.js';
import { omlxChatCompletion, isOmlxAvailable } from '../utils/omlx-client.js';
import { logger } from '../core/logger.js';

export interface VideoSearchResult {
  entry: VideoIndexEntry;
  matchedChapter?: { time: string; title: string };
  excerpt: string;
  relevanceScore?: number;
}

function keywordMatch(entry: VideoIndexEntry, query: string): boolean {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/);
  const searchable = [
    entry.title,
    ...entry.keywords,
    ...entry.chapters.map((c) => c.title),
    entry.transcriptSnippet,
  ].join(' ').toLowerCase();

  return tokens.some((t) => searchable.includes(t));
}

function findBestChapter(entry: VideoIndexEntry, query: string): { time: string; title: string } | undefined {
  const q = query.toLowerCase();
  for (const ch of entry.chapters) {
    if (ch.title.toLowerCase().includes(q) || ch.summary.toLowerCase().includes(q)) {
      return { time: ch.time, title: ch.title };
    }
  }
  return undefined;
}

function buildExcerpt(entry: VideoIndexEntry, query: string): string {
  // Try to find relevant snippet from transcript
  const q = query.toLowerCase();
  if (entry.transcriptSnippet) {
    const idx = entry.transcriptSnippet.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(entry.transcriptSnippet.length, idx + q.length + 100);
      return '…' + entry.transcriptSnippet.slice(start, end).trim() + '…';
    }
  }
  // Fallback: first chapter or title
  if (entry.chapters.length > 0) {
    return entry.chapters.map((c) => `${c.time} ${c.title}`).slice(0, 3).join(' | ');
  }
  return entry.title;
}

async function aiRankResults(
  candidates: VideoSearchResult[], query: string,
): Promise<VideoSearchResult[]> {
  if (candidates.length <= 5) return candidates;

  const available = await isOmlxAvailable();
  if (!available) return candidates.slice(0, 5);

  const itemList = candidates
    .map((c, i) => `[${i}] ${c.entry.title} — ${c.excerpt.slice(0, 80)}`)
    .join('\n');

  const prompt = [
    `Query: "${query}"`,
    'Rank these video results by relevance (most relevant first).',
    'Return ONLY a JSON array of indices, e.g. [2, 0, 4, 1, 3]',
    '',
    itemList,
  ].join('\n');

  const response = await omlxChatCompletion(prompt, {
    model: 'flash',
    timeoutMs: 10_000,
    temperature: 0.1,
    maxTokens: 100,
  });

  if (!response) return candidates.slice(0, 5);

  try {
    const match = response.match(/\[[\d,\s]+\]/);
    if (!match) return candidates.slice(0, 5);
    const indices = (JSON.parse(match[0]) as number[])
      .filter((i) => i >= 0 && i < candidates.length);
    const ranked = indices.map((i) => candidates[i]);
    // Add any missed items
    for (const c of candidates) {
      if (!ranked.includes(c)) ranked.push(c);
    }
    return ranked.slice(0, 5);
  } catch {
    return candidates.slice(0, 5);
  }
}

/** Search video index. Returns top 5 results. */
export async function searchVideos(
  vaultPath: string, query: string,
): Promise<VideoSearchResult[]> {
  const index = await getVideoIndex(vaultPath);
  if (index.length === 0) return [];

  // Phase 1: keyword pre-filter
  const candidates: VideoSearchResult[] = [];
  for (const entry of index) {
    if (keywordMatch(entry, query)) {
      candidates.push({
        entry,
        matchedChapter: findBestChapter(entry, query),
        excerpt: buildExcerpt(entry, query),
      });
    }
  }

  if (candidates.length === 0) {
    logger.info('vsearch', `No keyword matches for: ${query}`);
    return [];
  }

  // Phase 2: AI ranking (if too many candidates)
  const ranked = await aiRankResults(candidates, query);
  logger.info('vsearch', `Search "${query}": ${candidates.length} candidates → ${ranked.length} results`);
  return ranked;
}
