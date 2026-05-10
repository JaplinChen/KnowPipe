/**
 * Vault 知識缺口地圖 — 找出高頻實體缺乏深探、分類覆蓋不足、洞察孤島。
 */
import type { VaultKnowledge } from './types.js';

export interface GapEntry {
  topic: string;
  mentionCount: number;
  gapType: '高頻實體缺乏深探' | '分類覆蓋不足' | '洞察孤島';
  suggestion: string;
}

/** 從 knowledge store 找出知識缺口 */
export function findGaps(knowledge: VaultKnowledge): GapEntry[] {
  const gaps: GapEntry[] = [];
  const notes = Object.values(knowledge.notes);
  if (notes.length === 0) return gaps;

  const categories = new Set(notes.map(n => n.category.toLowerCase()));

  // 1. 高頻實體但無對應分類
  if (knowledge.globalEntities) {
    for (const entity of Object.values(knowledge.globalEntities)) {
      if (entity.mentions < 3) continue;
      const entityLow = entity.name.toLowerCase();
      const hasCat = [...categories].some(c => c.includes(entityLow) || entityLow.includes(c));
      if (!hasCat) {
        gaps.push({
          topic: entity.name,
          mentionCount: entity.mentions,
          gapType: '高頻實體缺乏深探',
          suggestion: `「${entity.name}」被 ${entity.mentions} 篇筆記提及，但沒有專題分類——建議蒐集深度文章補強`,
        });
      }
    }
  }

  // 2. 覆蓋不足的分類（筆記數 < 3，且 Vault 已夠大）
  if (notes.length > 20) {
    const catCount = new Map<string, number>();
    for (const note of notes) catCount.set(note.category, (catCount.get(note.category) ?? 0) + 1);
    for (const [cat, count] of catCount.entries()) {
      if (count < 3) {
        gaps.push({
          topic: cat,
          mentionCount: count,
          gapType: '分類覆蓋不足',
          suggestion: `「${cat}」只有 ${count} 篇，深度不足——是否繼續累積，或合併至相鄰分類？`,
        });
      }
    }
  }

  // 3. 洞察孤島：洞察引用的實體沒有對應筆記
  const noteEntityNames = new Set(notes.flatMap(n => n.entities.map(e => e.name.toLowerCase())));
  const orphanCount = new Map<string, number>();
  for (const note of notes) {
    for (const ins of note.insights) {
      for (const e of ins.entities) {
        const key = e.toLowerCase();
        if (!noteEntityNames.has(key)) orphanCount.set(key, (orphanCount.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [entity, count] of [...orphanCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    if (count >= 2) {
      gaps.push({
        topic: entity,
        mentionCount: count,
        gapType: '洞察孤島',
        suggestion: `「${entity}」出現在 ${count} 個洞察中，但無專屬筆記——建議蒐集原始資料補強`,
      });
    }
  }

  return gaps.sort((a, b) => b.mentionCount - a.mentionCount).slice(0, 15);
}

export function formatGapsReport(gaps: GapEntry[]): string {
  if (gaps.length === 0) return '✅ 知識覆蓋度良好，未發現明顯缺口。';

  const lines = [
    `🗺 知識缺口地圖`,
    `發現 ${gaps.length} 個需要補強的區域`,
    '',
  ];

  const grouped: Record<string, GapEntry[]> = {
    '高頻實體缺乏深探': [],
    '分類覆蓋不足': [],
    '洞察孤島': [],
  };
  for (const g of gaps) grouped[g.gapType].push(g);

  for (const [type, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    lines.push(`▸ ${type}（${items.length} 項）`);
    for (const g of items.slice(0, 5)) lines.push(`  • ${g.suggestion}`);
    lines.push('');
  }

  lines.push('下一步：挑最高頻缺口，用 /subscribe 或 /radar 補強 Vault。');
  return lines.join('\n');
}
