/**
 * 研究模組共用型別定義。
 * 涵蓋 Vault 筆記、壓縮快取、對話、投影片等介面。
 */

/* ── Vault 筆記 ──────────────────────────────────────────────── */

export interface NoteRecord {
  name: string;
  path: string;          // 相對於 vault root
  folder: string;
  body: string;
  preview: string;
  tags: string[];
  keywords: string[];
  category: string;
  size: number;
  mtime: number;         // epoch ms
}

/* ── 壓縮快取 ────────────────────────────────────────────────── */

export type CleanLevel = 'clean' | 'light' | 'standard' | 'aggressive';

export interface CompressEntry {
  path: string;
  compressedBody: string;
  ratio: number;
  date: string;          // ISO 8601
  sourceHash: string;    // body 的 hash，用於判斷是否過時
}

export interface CompressIndex {
  version: 1;
  entries: Record<string, CompressEntry>;
}

/* ── 對話 ────────────────────────────────────────────────────── */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: string;
}

export interface AnalysisOverview {
  summary: string;
  keyQuestions: string[];
  keyConcepts: string[];
}

/* ── 投影片 ──────────────────────────────────────────────────── */

export type SlideLayout =
  | 'title' | 'summary' | 'bullets' | 'compare' | 'table'
  | 'quote' | 'metrics' | 'timeline' | 'sources'
  | 'architecture' | 'gallery';

export type DeckStyle = 'notion' | 'technical-schematic' | 'corporate';

export interface SlideData {
  layout: SlideLayout;
  title: string;
  items?: string[];
  left_title?: string;
  left_items?: string[];
  right_title?: string;
  right_items?: string[];
  compare_summary?: string;
  headers?: string[];
  rows?: string[][];
  quote?: string;
  source?: string;
  takeaway?: string;
  image?: string;         // data URL
  image_caption?: string;
}

export interface SlideSpec {
  title: string;
  topic: string;
  style: DeckStyle;
  slides: SlideData[];
}
