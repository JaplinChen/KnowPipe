/**
 * 文本清理引擎 — 移植自 ObsVaultResearch text_utils.py。
 * 支援 4 級清理：clean / light / standard / aggressive。
 */
import type { CleanLevel } from './types.js';

/* ── 廣告 / 雜訊正規表達式 ───────────────────────────────────── */

const AD_RE = new RegExp(
  '立即購買|立刻購買|馬上購買|點擊購買|下單購買'
  + '|限時優惠|特價優惠|折扣優惠|搶購|限量'
  + '|免費試用|免費下載|免費領取|免費獲取'
  + '|關注我們|追蹤我們|訂閱頻道|訂閱我們'
  + '|廣告|贊助商|Sponsored|Advertisement'
  + '|All rights reserved|版權所有|©'
  + '|轉載自|本文來源|來源：http|閱讀全文|查看原文'
  + '|點擊這裡|點此了解|了解更多詳情|查看更多',
  'i',
);

/* ── Token 提取 ──────────────────────────────────────────────── */

function extractTokens(text: string): Set<string> {
  const cjk = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const latin = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  return new Set([...cjk, ...latin]);
}

/* ── 段落去重（Jaccard > 0.75） ──────────────────────────────── */

function deduplicateParagraphs(paragraphs: string[]): string[] {
  const unique: string[] = [];
  const seenSets: Set<string>[] = [];

  for (const para of paragraphs) {
    const words = extractTokens(para);
    if (words.size === 0) continue;

    const isDup = seenSets.some((s) => {
      const union = new Set([...words, ...s]);
      if (union.size === 0) return false;
      let intersection = 0;
      for (const w of words) if (s.has(w)) intersection++;
      return intersection / union.size > 0.75;
    });

    if (!isDup) {
      unique.push(para);
      seenSets.push(words);
    }
  }
  return unique;
}

/* ── 主題相關性評分 ──────────────────────────────────────────── */

function isTopicRelevant(para: string, topicTokens: Set<string>, threshold: number): boolean {
  if (topicTokens.size === 0) return true;
  if (/^#{1,4}\s/.test(para.trim())) return true;  // 保留標題

  const paraTokens = extractTokens(para);
  if (paraTokens.size === 0) return false;

  let hit = 0;
  for (const t of topicTokens) if (paraTokens.has(t)) hit++;

  const score = (hit / topicTokens.size + hit / paraTokens.size) / 2;
  return score >= threshold;
}

/* ── 公開 API ────────────────────────────────────────────────── */

/**
 * 文本預處理：去廣告、去圖片 markdown、主題篩選、段落去重。
 * @returns 清理後的文本
 */
export function preprocessText(text: string, topic = '', level: CleanLevel = 'standard'): string {
  if (!text) return text;

  // 移除圖片 markdown 與 HTML 標籤
  let cleaned = text.replace(/!\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // 移除廣告行
  cleaned = cleaned
    .split('\n')
    .filter((line) => !AD_RE.test(line))
    .join('\n');

  // 合併多餘空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  if (level === 'clean' || level === 'light' || !topic.trim()) {
    return cleaned;
  }

  // 主題篩選
  const topicTokens = extractTokens(topic);
  const threshold = level === 'aggressive' ? 0.20 : 0.08;
  const paragraphs = cleaned.split(/\n\n+/);

  const kept = paragraphs.filter((p) => {
    const s = p.trim();
    return s.length > 0 && isTopicRelevant(s, topicTokens, threshold);
  });

  if (kept.length === 0) return cleaned;

  // 段落去重
  const unique = deduplicateParagraphs(kept);
  return unique.join('\n\n').trim() || cleaned;
}

/**
 * 將 Markdown 切分為前導文字與 ## 段落。
 */
export function splitMarkdownSections(content: string): { lead: string; sections: Array<{ title: string; lines: string[] }> } {
  const lines = content.split('\n');
  const leadLines: string[] = [];
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      leadLines.push(line);
    }
  }
  if (current) sections.push(current);

  return { lead: leadLines.join('\n').trim(), sections };
}

/**
 * 從 Markdown 擷取主標題（H1 或 H2）。
 */
export function firstHeadingOrTitle(content: string, fallback: string): string {
  for (const line of content.split('\n')) {
    const s = line.trim();
    if (s.startsWith('# ')) return s.slice(2).trim().slice(0, 80);
    if (s.startsWith('## ')) return s.slice(3).trim().slice(0, 80);
  }
  return fallback.slice(0, 80);
}
