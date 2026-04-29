/** 分類規則索引 — 組裝所有分類規則，由 classifier.ts 引用 */

export interface CategoryRule {
  name: string;
  keywords: string[];
  exclude?: string[];
}

// 延遲 import 避免循環依賴（ai/other 引用此檔的 CategoryRule type）
import { AI_CATEGORIES } from './classifier-categories-ai.js';
import { OTHER_CATEGORIES } from './classifier-categories-other.js';

export const CATEGORIES: CategoryRule[] = [
  // 所有新文章固定放入收件匣，由用戶手動整理
  { name: 'inbox', keywords: [] },

  // AI 三層分類：具體工具 → 功能分類兜底 → AI 通用兜底
  ...AI_CATEGORIES,

  // 其他頂層分類 + 知識管理子分類 + 系統保留
  ...OTHER_CATEGORIES,
];
