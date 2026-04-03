/**
 * 投影片規格解析與建構 — 移植自 slide_spec.py。
 * 將 Markdown 內容轉換為結構化 SlideSpec。
 */
import { splitMarkdownSections, firstHeadingOrTitle } from './text-cleaner.js';
import {
  inferSlideLayout, inferDeckStyle, inferVisualKind, styleDisplayName,
  buildSourceEntries, buildDeckChips, buildMetricEntries, buildTimelineEntries,
  buildQuoteEntry, buildCompareSummary, normalizeSlidePayload,
} from './slide-builders.js';

/* ── 工具函式 ────────────────────────────────────────────────── */

/** 將自由文字行正規化為簡短要點清單。 */
function compactTextLines(lines: string[], limit = 6): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    const s = raw.trim();
    if (!s || s.startsWith('#') || (s.startsWith('|') && s.endsWith('|'))) continue;
    let cleaned = s.replace(/^\d+[.、]\s*/, '').replace(/^[-*•]\s*/, '').trim();
    if (cleaned) items.push(cleaned.slice(0, 160));
    if (items.length >= limit) break;
  }
  return items;
}

/** 解析 Markdown 表格。 */
function parseTable(lines: string[]): { headers: string[]; rows: string[][] } {
  const tableLines = lines.filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
  if (tableLines.length < 2) return { headers: [], rows: [] };

  const parsed: string[][] = [];
  for (const line of tableLines) {
    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length > 0) parsed.push(cells);
  }
  if (parsed.length < 2) return { headers: [], rows: [] };
  return { headers: parsed[0], rows: parsed.slice(1, 5) };
}

/* ── finalize ────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function finalizeSlideSpec(spec: Record<string, any>): Record<string, unknown> {
  let style = String(spec.style ?? 'notion');
  if (!['technical-schematic', 'corporate', 'notion'].includes(style)) {
    const blob = String(spec.topic ?? spec.title ?? '');
    style = inferDeckStyle(blob, blob);
  }
  spec.style = style;
  spec.title = String(spec.title ?? spec.topic ?? '研究簡報').slice(0, 80);
  spec.topic = String(spec.topic ?? spec.title).slice(0, 80);

  let slides: Array<Record<string, unknown>> = (Array.isArray(spec.slides) ? spec.slides : [])
    .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s: Record<string, unknown>) => normalizeSlidePayload(s, spec.title, style));

  if (slides.length === 0) {
    slides = [{ layout: 'title', title: spec.title, items: ['目前內容不足，已建立最小簡報骨架。'],
      chips: [styleDisplayName(style), '1 頁重點'], visual: { kind: 'hero-panel' } }];
  }
  if (slides.length === 1) {
    slides.push({ layout: 'summary', title: '待補充重點',
      items: ['請加入更多筆記內容、比較段落、表格或引用，系統會自動生成更完整的簡報。'],
      chips: ['內容不足', '可再加入筆記'], visual: { kind: 'insight-board' } });
  }

  const MAX = 12;
  if (slides.length > MAX) {
    const kept = slides.slice(0, MAX - 1);
    const hidden = slides.slice(MAX - 1);
    const titles = hidden.slice(0, 4).map((s) => String(s.title ?? '未命名頁').slice(0, 24));
    const extra = hidden.length > titles.length ? [`另有 ${hidden.length - titles.length} 頁已收斂`] : [];
    kept.push({ layout: 'summary', title: '附錄與延伸主題', items: [...titles, ...extra],
      chips: [`原始 ${slides.length} 頁`, `保留 ${kept.length} 頁`], visual: { kind: 'insight-board' } });
    slides = kept;
  }

  spec.slides = slides;
  return spec;
}

/* ── 公開 API ────────────────────────────────────────────────── */

/** 解析 JSON 投影片規格（接受 fenced JSON 或裸 JSON）。 */
export function parseSlideSpecPayload(content: string): Record<string, unknown> | null {
  let text = (content || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fenced) {
    text = fenced[1].trim();
  } else {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) text = text.slice(a, b + 1);
  }

  try {
    const obj = JSON.parse(text);
    if (typeof obj === 'object' && obj !== null && Array.isArray(obj.slides)) {
      return finalizeSlideSpec(obj);
    }
  } catch { /* ignore */ }
  return null;
}

/** 將 Markdown 內容轉換為結構化投影片規格。 */
export function buildSlideSpec(content: string, topic: string): Record<string, unknown> {
  const deckTitle = firstHeadingOrTitle(content, topic || '簡報');
  const { lead, sections } = splitMarkdownSections(content);
  const leadItems = compactTextLines(lead.split('\n'), 4);
  const style = inferDeckStyle(content, topic || deckTitle);
  const refsAll = (content.match(/\[\[([^\]]+)\]\]/g) ?? []).map((m) => m.slice(2, -2)).slice(0, 6);
  const coverChips = buildDeckChips(style, refsAll, leadItems, Math.min(10, Math.max(4, sections.length + (leadItems.length > 0 ? 2 : 1))));

  const slides: Array<Record<string, unknown>> = [
    { layout: 'title', title: deckTitle, subtitle: topic && topic !== deckTitle ? topic : '',
      items: leadItems, chips: coverChips, visual: { kind: 'hero-panel' } },
  ];

  if (leadItems.length > 0) {
    slides.push({ layout: 'summary', title: '重點摘要', items: leadItems.slice(0, 4),
      visual: { kind: inferVisualKind('重點摘要', leadItems.slice(0, 4), 'summary') } });
  }

  const secs = sections.length > 0 ? sections : (content.trim() ? [{ title: deckTitle, lines: content.split('\n') }] : []);

  for (const section of secs.slice(0, 12)) {
    const title = section.title.slice(0, 80);
    const lines = section.lines;
    const { headers, rows } = parseTable(lines);
    const items = compactTextLines(lines, 8);
    const quotes = lines.filter((l) => l.trim().startsWith('>')).map((l) => l.trim().slice(1).trim());
    const layout = inferSlideLayout(title, lines, headers, rows);
    const numbered = lines.map((l) => l.trim().match(/^\d+[.、]\s+(.+)$/)).filter(Boolean).map((m) => m![1].trim());
    const refs = lines.flatMap((l) => (l.match(/\[\[([^\]]+)\]\]/g) ?? []).map((m) => m.slice(2, -2))).slice(0, 6);

    if (layout === 'table') { slides.push({ layout: 'table', title, headers: headers.slice(0, 3), rows: rows.slice(0, 4).map((r) => r.slice(0, 3)), table_summary: [] }); continue; }
    if (layout === 'timeline') { const tl = (numbered.length > 0 ? numbered : items).slice(0, 5); slides.push({ layout: 'timeline', title, items: tl.length > 0 ? tl : ['待補充時間線'], timeline_items: buildTimelineEntries(tl), visual: { kind: 'timeline' } }); continue; }
    if (layout === 'metrics') { const mi = items.slice(0, 4); slides.push({ layout: 'metrics', title, items: mi.length > 0 ? mi : ['待補充指標'], metric_items: buildMetricEntries(mi), visual: { kind: 'metric-cards' } }); continue; }
    if (layout === 'sources') { const se = buildSourceEntries(refs.length > 0 ? refs : items.slice(0, 5), items.slice(0, 3)); slides.push({ layout: 'sources', title, items: refs.length > 0 ? refs : items.slice(0, 5), notes: items.slice(0, 3), source_items: se, visual: { kind: 'source-list' } }); continue; }
    if (layout === 'architecture') { slides.push({ layout: 'architecture', title, items: items.slice(0, 4).length > 0 ? items.slice(0, 4) : ['待補充架構層次'], visual: { kind: 'layer-diagram' } }); continue; }
    if (layout === 'quote' && quotes.length > 0) { const qe = buildQuoteEntry(quotes, items.slice(0, 3), refs); slides.push({ layout: 'quote', title, quote: qe.quote, quote_entry: qe, items: items.slice(0, 3) }); continue; }
    if (layout === 'compare') {
      const mid = Math.max(1, Math.min(items.length - 1, Math.floor(items.length / 2)));
      const left = items.slice(0, mid).length > 0 ? items.slice(0, mid) : ['待補充'];
      const right = items.slice(mid, mid + 4).length > 0 ? items.slice(mid, mid + 4) : items.slice(0, 1).length > 0 ? items.slice(0, 1) : ['待補充'];
      slides.push({ layout: 'compare', title, left_title: '要點 A', right_title: '要點 B', left_items: left, right_items: right,
        compare_summary: buildCompareSummary(left, right), visual: { kind: inferVisualKind(title, items.slice(0, 6), 'compare') } });
      continue;
    }
    slides.push({ layout: 'bullets', title, items: items.slice(0, 6).length > 0 ? items.slice(0, 6) : ['（此段缺少可轉換的簡報要點）'],
      visual: { kind: inferVisualKind(title, items.slice(0, 6), 'bullets') ?? 'text-panel' } });
  }

  if (refsAll.length > 0 && !slides.some((s) => s.layout === 'sources')) {
    slides.push({ layout: 'sources', title: '核心來源', items: refsAll.slice(0, 6), notes: leadItems.slice(0, 3),
      source_items: buildSourceEntries(refsAll.slice(0, 6), leadItems.slice(0, 3)), visual: { kind: 'source-list' } });
  }

  return finalizeSlideSpec({ title: deckTitle, topic: topic || deckTitle, style, slides });
}
