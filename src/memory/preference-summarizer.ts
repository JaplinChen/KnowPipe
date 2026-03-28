/**
 * Generate user preference summaries from save events using oMLX.
 * Analyzes category distribution, platform usage, and keyword patterns.
 */
import type { SaveEvent, PreferenceSummary } from './memory-types.js';
import { omlxChatCompletion, isOmlxAvailable } from '../utils/omlx-client.js';
import { logger } from '../core/logger.js';

function countFrequency(items: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function buildStatisticalSummary(events: SaveEvent[]): {
  topCategories: string[];
  topPlatforms: string[];
  topKeywords: string[];
  statsText: string;
} {
  const categories = countFrequency(events.map((e) => e.category));
  const platforms = countFrequency(events.map((e) => e.platform));
  const keywords = countFrequency(events.flatMap((e) => e.keywords));

  const topCategories = categories.slice(0, 5).map(([k]) => k);
  const topPlatforms = platforms.slice(0, 5).map(([k]) => k);
  const topKeywords = keywords.slice(0, 10).map(([k]) => k);

  const statsText = [
    `共 ${events.length} 筆存檔`,
    `分類分布: ${categories.slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`,
    `平台分布: ${platforms.slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`,
    `常見關鍵字: ${topKeywords.join(', ')}`,
    `最近標題: ${events.slice(-5).map((e) => e.title).join('; ')}`,
  ].join('\n');

  return { topCategories, topPlatforms, topKeywords, statsText };
}

/** Generate preference summary from user events. Returns null if oMLX unavailable. */
export async function generatePreferenceSummary(
  events: SaveEvent[],
): Promise<PreferenceSummary | null> {
  const { topCategories, topPlatforms, topKeywords, statsText } = buildStatisticalSummary(events);

  // Try AI-powered description
  const available = await isOmlxAvailable();
  let description = `偏好分類: ${topCategories.join(', ')}; 常用平臺: ${topPlatforms.join(', ')}`;

  if (available) {
    const prompt = [
      '根據以下使用者存檔統計，用 2-3 句話描述這個人的知識收藏偏好和興趣方向。',
      '直接描述，不要用「這位使用者」開頭。',
      '',
      statsText,
    ].join('\n');

    const response = await omlxChatCompletion(prompt, {
      model: 'flash',
      timeoutMs: 10_000,
      temperature: 0.3,
      maxTokens: 200,
    });

    if (response) {
      description = response.trim();
    }
  }

  logger.info('memory', '偏好摘要生成完成', { categories: topCategories.length });

  return {
    topCategories,
    preferredPlatforms: topPlatforms,
    frequentKeywords: topKeywords,
    description,
    generatedAt: new Date().toISOString(),
  };
}
