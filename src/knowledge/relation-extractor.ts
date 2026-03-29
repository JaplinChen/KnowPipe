/**
 * Heuristic relation extraction for vault notes.
 * Extracts KnowledgeRelation triples from keyword pairs + summary text.
 * No LLM required — pure pattern matching.
 */
import type { KnowledgeRelation, RelationType } from './types.js';
import { classifyEntityType } from './entity-classifier.js';

/**
 * Relation patterns: [regex, relationType].
 * Matches common Chinese and English phrases that indicate relationships.
 */
const REL_PATTERNS: Array<[RegExp, RelationType]> = [
  [/\bvs\.?\b|對比|比較/i, 'compares'],
  [/取代|替代|alternative to/i, 'alternative_to'],
  [/基於|建立在|built on|extends/i, 'builds_on'],
  [/整合|結合|integrates?|combines?/i, 'integrates'],
  [/使用|呼叫|依賴|uses?|depends? on/i, 'uses'],
  [/是.*一部分|part of|子集/i, 'part_of'],
];

const TECH_TYPES = new Set(['tool', 'framework', 'platform', 'technology']);

/**
 * Heuristic relation extraction from note keywords and summary.
 * Returns up to 3 relations per note.
 */
export function extractRelations(
  keywords: string[],
  summary: string,
  noteId: string,
): KnowledgeRelation[] {
  const relations: KnowledgeRelation[] = [];
  if (keywords.length < 2) return relations;

  const summaryLower = summary.toLowerCase();

  for (let i = 0; i < keywords.length && relations.length < 3; i++) {
    for (let j = i + 1; j < keywords.length && relations.length < 3; j++) {
      const a = keywords[i];
      const b = keywords[j];
      if (!summaryLower.includes(a.toLowerCase())) continue;
      if (!summaryLower.includes(b.toLowerCase())) continue;

      const aIdx = summaryLower.indexOf(a.toLowerCase());
      const bIdx = summaryLower.indexOf(b.toLowerCase());
      const [first, second, from, to] = aIdx < bIdx
        ? [aIdx, bIdx + b.length, a, b]
        : [bIdx, aIdx + a.length, b, a];
      const gap = summaryLower.slice(first, second);

      let matched: RelationType | null = null;
      for (const [re, type] of REL_PATTERNS) {
        if (re.test(gap)) { matched = type; break; }
      }

      // Both are tech entities with no explicit relation → integrates
      if (!matched) {
        if (TECH_TYPES.has(classifyEntityType(from, '')) && TECH_TYPES.has(classifyEntityType(to, ''))) {
          matched = 'integrates';
        }
      }

      if (matched) {
        relations.push({
          from, to, type: matched,
          description: gap.slice(0, 50).trim(),
          sourceNoteId: noteId,
        });
      }
    }
  }

  return relations;
}
