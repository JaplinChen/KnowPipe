/**
 * AI-based relevance scoring for patrol items using oMLX.
 * Batches items for efficiency; graceful fallback when oMLX unavailable.
 */
import type { PatrolItem } from './sources/source-types.js';
import { omlxChatCompletion, isOmlxAvailable } from '../utils/omlx-client.js';
import { logger } from '../core/logger.js';

const BATCH_SIZE = 5;
const DEFAULT_THRESHOLD = 5;

interface ScoredItem extends PatrolItem {
  relevanceScore: number;
}

function buildScoringPrompt(topics: string[], items: PatrolItem[]): string {
  const topicsStr = topics.join(', ');
  const itemList = items
    .map((item, i) => `[${i}] ${item.title} — ${item.description.slice(0, 100)}`)
    .join('\n');

  return [
    `You are a relevance scorer. The user is interested in these topics: ${topicsStr}`,
    '',
    'Rate each item 0-10 for relevance to the user\'s interests.',
    'Return ONLY a JSON array of scores, e.g. [8, 3, 7, 1, 6]',
    'No explanation needed.',
    '',
    'Items:',
    itemList,
  ].join('\n');
}

function parseScores(response: string, count: number): number[] {
  try {
    const match = response.match(/\[[\d,\s]+\]/);
    if (!match) return new Array(count).fill(DEFAULT_THRESHOLD);
    const scores = JSON.parse(match[0]) as number[];
    if (scores.length !== count) return new Array(count).fill(DEFAULT_THRESHOLD);
    return scores;
  } catch {
    return new Array(count).fill(DEFAULT_THRESHOLD);
  }
}

/** Score items by relevance to topics. Returns items with scores >= threshold. */
export async function scoreAndFilter(
  items: PatrolItem[],
  topics: string[],
  threshold = 6,
): Promise<ScoredItem[]> {
  if (items.length === 0) return [];

  // If no topics or oMLX unavailable, return all with default score
  const available = await isOmlxAvailable();
  if (!available || topics.length === 0) {
    logger.info('patrol-scorer', 'oMLX 不可用或無主題，跳過評分');
    return items.map((item) => ({ ...item, relevanceScore: DEFAULT_THRESHOLD }));
  }

  const scored: ScoredItem[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const prompt = buildScoringPrompt(topics, batch);

    const response = await omlxChatCompletion(prompt, {
      model: 'flash',
      timeoutMs: 15_000,
      temperature: 0.1,
      maxTokens: 100,
    });

    const scores = parseScores(response ?? '', batch.length);
    for (let j = 0; j < batch.length; j++) {
      scored.push({ ...batch[j], relevanceScore: scores[j] });
    }
  }

  const filtered = scored.filter((s) => s.relevanceScore >= threshold);
  logger.info('patrol-scorer', `評分完成: ${scored.length} 項中 ${filtered.length} 項通過閾值 ${threshold}`);
  return filtered;
}
