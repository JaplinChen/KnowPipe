/** Types for info card generation. */

export interface CardData {
  title: string;
  summary: string;
  category: string;
  platform: string;
  date: string;
  keywords: string[];
  accentColor: string;
}

/** Map top-level categories to accent colors. */
const CATEGORY_COLORS: Record<string, string> = {
  'AI': '#6366f1',
  '程式設計': '#0ea5e9',
  '生產力': '#22c55e',
  '科技': '#f59e0b',
  '投資理財': '#ef4444',
  '創業商業': '#f97316',
  '設計': '#ec4899',
  '行銷': '#8b5cf6',
  '中文媒體': '#14b8a6',
  '新聞時事': '#64748b',
  '生活': '#a3e635',
};

const DEFAULT_COLOR = '#6366f1';

/** Resolve accent color from category string. */
export function resolveAccentColor(category: string): string {
  const topLevel = category.split('/')[0];
  return CATEGORY_COLORS[topLevel] ?? DEFAULT_COLOR;
}
