/**
 * 投影片規格輔助建構 — 移植自 slide_builders.py。
 * 版面推斷、風格推斷、rich data builders、normalize。
 */

/* ── 推斷函式 ────────────────────────────────────────────────── */

export function inferSlideLayout(
  title: string, lines: string[], headers: string[], rows: string[][],
): string {
  const tl = title.toLowerCase();
  if ('來源'.includes(title) || tl.includes('source') || title.includes('參考')) return 'sources';
  if (title.includes('架構') || tl.includes('architecture') || title.includes('分層') || title.includes('組成')) return 'architecture';
  if (title.includes('時間') || tl.includes('timeline') || title.includes('演進') || title.includes('歷程')) return 'timeline';
  if (title.includes('指標') || tl.includes('metric') || title.includes('數據') || title.includes('亮點')) return 'metrics';
  if (headers.length > 0 && rows.length > 0) return 'table';
  if (lines.some((l) => l.trim().startsWith('>'))) return 'quote';
  const blob = lines.join('\n').toLowerCase();
  if (title.includes('比較') || tl.includes('compare') || tl.includes('vs') || (blob.includes('優勢') && blob.includes('限制'))) return 'compare';
  if (blob.includes('比較') || blob.includes('差異')) return 'compare';
  return 'bullets';
}

export function inferDeckStyle(content: string, topic: string): string {
  const blob = (topic + '\n' + content).toLowerCase();
  if (['架構', 'architecture', 'workflow', '流程', 'agent', 'mcp', 'tauri', 'react'].some((t) => blob.includes(t))) return 'technical-schematic';
  if (['企業', 'corporate', '商業', '市場', '報告', '策略', '投資'].some((t) => blob.includes(t))) return 'corporate';
  return 'notion';
}

export function inferVisualKind(title: string, items: string[], layout: string): string | null {
  const blob = (title + '\n' + items.join('\n')).toLowerCase();
  if (layout === 'summary') {
    if (['流程', 'workflow', '步驟', 'pipeline'].some((t) => blob.includes(t))) return 'workflow-map';
    if (['架構', 'system', 'platform', 'agent', 'mcp'].some((t) => blob.includes(t))) return 'system-map';
    return 'insight-board';
  }
  if (layout === 'compare') {
    if (['成本', 'risk', '風險', '取捨', '優勢', '限制'].some((t) => blob.includes(t))) return 'tradeoff-matrix';
    return 'vs-diagram';
  }
  if (layout === 'bullets' && ['流程', '步驟', '導入', '採用'].some((t) => blob.includes(t))) return 'process-strip';
  return null;
}

export function styleDisplayName(style: string): string {
  return ({ 'technical-schematic': '技術架構', corporate: '企業簡報', notion: '研究筆記' } as Record<string, string>)[style] ?? '研究筆記';
}

/* ── Rich data builders ──────────────────────────────────────── */

function normalizeSourceLabel(value: string): string {
  let text = (value || '').trim();
  if (text.startsWith('[[') && text.endsWith(']]')) text = text.slice(2, -2).split('|')[0].trim();
  text = text.replace(/^https?:\/\//i, '').trim().replace(/`/g, '');
  return text.slice(0, 96) || '未命名來源';
}

function sourceKindForLabel(value: string): string {
  const text = (value || '').trim().toLowerCase();
  if (value.startsWith('[[')) return 'Vault 筆記';
  if (text.includes('github.com')) return 'GitHub';
  if (text.startsWith('http')) return 'Web';
  if (['thread', 'x.com', 'twitter.com', 'reddit.com'].some((t) => text.includes(t))) return '社群';
  return '研究來源';
}

export function buildSourceEntries(items: string[], notes: string[]): Array<Record<string, unknown>> {
  return (items || []).slice(0, 6).map((item, i) => ({
    index: i + 1,
    label: normalizeSourceLabel(item),
    kind: sourceKindForLabel(item),
    detail: ((notes || [])[i] || '').slice(0, 92),
  }));
}

export function buildDeckChips(style: string, refs: string[], leadItems: string[], slideCountHint: number): string[] {
  const chips = [styleDisplayName(style)];
  if (refs.length > 0) chips.push(`${Math.min(refs.length, 9)} 筆來源`);
  if (slideCountHint) chips.push(`${slideCountHint} 頁重點`);
  if (leadItems.length > 0) chips.push(leadItems[0].replace(/\s+/g, ' ').slice(0, 22));
  return chips.slice(0, 4);
}

export function buildMetricEntries(items: string[]): Array<Record<string, string>> {
  return (items || []).slice(0, 4).map((item, i) => {
    const raw = (item || '').trim();
    const m = raw.match(/(\d+(?:\.\d+)?%?)/);
    let value = m ? m[1] : `0${i + 1}`;
    let label = m ? raw.replace(value, '').trim().replace(/^[\s:,\-]+|[\s:,\-]+$/g, '') : raw;
    let detail = '重點觀察';
    if (!label) label = '關鍵指標';
    if (label.includes(' / ')) { [label, detail] = label.split(' / ', 2).map((p) => p.trim().slice(0, 30)); }
    else if (label.includes('｜')) { [label, detail] = label.split('｜', 2).map((p) => p.trim().slice(0, 30)); }
    else if (label.length > 22) { detail = label.slice(22, 58).trim(); label = label.slice(0, 22).trim(); }
    return { value: value.slice(0, 10), label: label.slice(0, 28), detail: detail.slice(0, 44) };
  });
}

export function buildTimelineEntries(items: string[]): Array<Record<string, string>> {
  return (items || []).slice(0, 5).map((item, i) => {
    const raw = (item || '').trim();
    let title = raw, detail = '';
    if (raw.includes('：')) [title, detail] = raw.split('：', 2).map((p) => p.trim());
    else if (raw.includes(':')) [title, detail] = raw.split(':', 2).map((p) => p.trim());
    else if (raw.includes(' - ')) [title, detail] = raw.split(' - ', 2).map((p) => p.trim());
    else if (raw.length > 20) { title = raw.slice(0, 20).trim(); detail = raw.slice(20, 68).trim(); }
    return { stage: `0${i + 1}`, title: title.slice(0, 24), detail: detail.slice(0, 54) };
  });
}

export function buildCompareSummary(left: string[], right: string[]): string[] {
  const summary: string[] = [];
  if (left.length > 0) summary.push(`左側 ${Math.min(left.length, 4)} 項`);
  if (right.length > 0) summary.push(`右側 ${Math.min(right.length, 4)} 項`);
  const all = [...left.slice(0, 4), ...right.slice(0, 4)].join(' ');
  if (['成本', '風險', '限制', '優勢', '效益'].some((t) => all.includes(t))) summary.push('含取捨分析');
  return summary.slice(0, 3);
}

export function buildTableSummary(headers: string[], rows: string[][]): string[] {
  const summary: string[] = [];
  if (headers.length > 0) summary.push(`${Math.min(headers.length, 3)} 欄維度`);
  if (rows.length > 0) summary.push(`${Math.min(rows.length, 4)} 列重點`);
  const all = rows.slice(0, 4).flat().join(' ');
  if (['風險', '成本', '價值', '效益', '隱私'].some((t) => all.includes(t))) summary.push('含決策維度');
  return summary.slice(0, 3);
}

export function buildQuoteEntry(quotes: string[], items: string[], refs: string[]): Record<string, string> {
  const quote = (quotes[0] ?? items[0] ?? '待補充引言').slice(0, 220);
  const takeaway = (items[0] ?? '此引言用於支撐本頁核心觀點').slice(0, 80);
  const source = refs.length > 0 ? normalizeSourceLabel(refs[0]) : '研究來源';
  return { quote, takeaway, source };
}

/* ── ensureTextList ──────────────────────────────────────────── */

export function ensureTextList(value: unknown, limit = 6, fallback?: string[]): string[] {
  const items: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) { const s = String(v ?? '').trim(); if (s) items.push(s.slice(0, 140)); }
  } else if (typeof value === 'string') {
    const s = value.trim(); if (s) items.push(s.slice(0, 140));
  }
  if (items.length === 0 && fallback) {
    for (const f of fallback) { const s = String(f ?? '').trim(); if (s) items.push(s.slice(0, 140)); }
  }
  return items.slice(0, limit);
}

/* ── normalizeSlidePayload ───────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSlidePayload(slide: Record<string, any>, deckTitle: string, style: string): Record<string, unknown> {
  const s = { ...slide };
  const layout = String(s.layout ?? 'bullets').trim().toLowerCase();
  s.title = String(s.title ?? deckTitle ?? '未命名頁').trim().slice(0, 80);
  s.layout = layout;

  switch (layout) {
    case 'title':
      s.items = ensureTextList(s.items, 4);
      s.chips = ensureTextList(s.chips, 4, [styleDisplayName(style)]);
      s.subtitle = String(s.subtitle ?? '').trim().slice(0, 80);
      break;
    case 'summary':
      s.items = ensureTextList(s.items, 5, ['請補充本頁摘要要點。']);
      s.chips = ensureTextList(s.chips, 4);
      s.visual ??= { kind: inferVisualKind(s.title as string, s.items as string[], 'summary') };
      break;
    case 'bullets':
      s.items = ensureTextList(s.items, 6, ['（此段缺少可轉換的簡報要點）']);
      s.visual ??= { kind: inferVisualKind(s.title as string, s.items as string[], 'bullets') ?? 'text-panel' };
      break;
    case 'compare': {
      let left = ensureTextList(s.left_items, 4);
      let right = ensureTextList(s.right_items, 4);
      if (!left.length && !right.length) {
        const merged = ensureTextList(s.items, 6, ['待補充']);
        const mid = Math.max(1, Math.floor(merged.length / 2));
        left = merged.slice(0, mid); right = merged.slice(mid);
        if (!right.length) right = merged.slice(0, 1);
      }
      s.left_title = String(s.left_title ?? '要點 A').slice(0, 28);
      s.right_title = String(s.right_title ?? '要點 B').slice(0, 28);
      s.left_items = left.length ? left : ['待補充'];
      s.right_items = right.length ? right : ['待補充'];
      s.compare_summary = ensureTextList(s.compare_summary, 3) || buildCompareSummary(s.left_items as string[], s.right_items as string[]);
      s.visual ??= { kind: inferVisualKind(s.title as string, [...(s.left_items as string[]), ...(s.right_items as string[])], 'compare') };
      break;
    }
    case 'metrics':
      s.items = ensureTextList(s.items, 4);
      s.metric_items = Array.isArray(s.metric_items) ? s.metric_items : buildMetricEntries(s.items as string[]);
      s.visual ??= { kind: 'metric-cards' };
      break;
    case 'timeline':
      s.items = ensureTextList(s.items, 5, ['待補充時間線']);
      s.timeline_items = Array.isArray(s.timeline_items) ? s.timeline_items : buildTimelineEntries(s.items as string[]);
      s.visual ??= { kind: 'timeline' };
      break;
    case 'sources':
      s.items = ensureTextList(s.items, 6, ['待補充來源']);
      s.notes = ensureTextList(s.notes, 3);
      s.source_items = Array.isArray(s.source_items) ? s.source_items : buildSourceEntries(s.items as string[], s.notes as string[]);
      s.visual ??= { kind: 'source-list' };
      break;
    case 'architecture':
      s.items = ensureTextList(s.items, 4, ['待補充架構層次']);
      s.visual ??= { kind: 'layer-diagram' };
      break;
    case 'table': {
      let headers = Array.isArray(s.headers) ? s.headers.map((h: unknown) => String(h ?? '').trim().slice(0, 32)).filter(Boolean).slice(0, 3) : [];
      let rows: string[][] = [];
      if (Array.isArray(s.rows)) {
        for (const row of (s.rows as unknown[]).slice(0, 4)) {
          if (Array.isArray(row)) rows.push(row.slice(0, Math.max(1, headers.length || 3)).map((c: unknown) => String(c ?? '').trim().slice(0, 72)));
        }
      }
      if (!headers.length) headers = ['維度', '做法', '說明'];
      if (!rows.length) rows = [['待補充', '待補充', '待補充']];
      s.headers = headers; s.rows = rows;
      s.table_summary = ensureTextList(s.table_summary, 3) || buildTableSummary(headers, rows);
      break;
    }
    case 'quote': {
      s.items = ensureTextList(s.items, 3);
      const qe = (typeof s.quote_entry === 'object' && s.quote_entry) ? s.quote_entry as Record<string, unknown> : {};
      const quote = String(s.quote ?? qe.quote ?? '').trim() || '待補充引言';
      s.quote = quote.slice(0, 220);
      s.quote_entry = {
        quote: s.quote,
        takeaway: String(qe.takeaway ?? ((s.items as string[])[0] ?? '此引言用於支撐本頁核心觀點')).slice(0, 80),
        source: String(qe.source ?? '研究來源').slice(0, 40),
      };
      break;
    }
    case 'gallery':
      s.images = Array.isArray(s.images) ? (s.images as unknown[]).filter((img): img is Record<string, unknown> => typeof img === 'object' && img !== null).slice(0, 4) : [];
      s.items = ensureTextList(s.items, 2);
      break;
    default:
      s.layout = 'bullets';
      s.items = ensureTextList(s.items, 6, ['（此段缺少可轉換的簡報要點）']);
      s.visual ??= { kind: 'text-panel' };
  }
  return s;
}
