/**
 * PPTX 投影片生成 — 使用 pptxgenjs 取代 python-pptx。
 * 支援 11 種版面、3 種風格調色盤。
 */
import PptxGenJSModule from 'pptxgenjs';
import type PptxTypes from 'pptxgenjs';
// Handle CJS/ESM interop: pptxgenjs exports { default: PptxGenJS }
const PptxGenJS = (PptxGenJSModule as unknown as { default: typeof PptxGenJSModule }).default ?? PptxGenJSModule;
type PptxSlide = PptxTypes.Slide;
type PptxShapeType = PptxTypes.ShapeType;
import { buildMetricEntries, buildTimelineEntries, buildSourceEntries } from './slide-builders.js';

type RGB = [number, number, number];
interface Palette {
  bg: RGB; hero: RGB; panel: RGB; panel_alt: RGB;
  text: RGB; muted: RGB; accent: RGB; accent2: RGB;
}

const PALETTES: Record<string, Palette> = {
  'technical-schematic': { bg:[0x0f,0x11,0x17], hero:[0x14,0x18,0x24], panel:[0x18,0x1c,0x27], panel_alt:[0x20,0x24,0x36], text:[0xec,0xee,0xf5], muted:[0xb0,0xb8,0xd0], accent:[0x4e,0xc9,0x94], accent2:[0x9d,0x8f,0xff] },
  corporate: { bg:[0xf3,0xf6,0xfb], hero:[0xff,0xff,0xff], panel:[0xff,0xff,0xff], panel_alt:[0xe8,0xef,0xfa], text:[0x14,0x21,0x3d], muted:[0x5c,0x67,0x7d], accent:[0x1d,0x4e,0xd8], accent2:[0x0f,0x76,0x88] },
  notion: { bg:[0xf7,0xf3,0xea], hero:[0xff,0xfd,0xf8], panel:[0xff,0xfd,0xf8], panel_alt:[0xf0,0xe7,0xd8], text:[0x1f,0x23,0x28], muted:[0x6b,0x72,0x80], accent:[0xb7,0x6e,0x3a], accent2:[0x8b,0x5c,0x2b] },
};

function hex(rgb: RGB): string { return rgb.map((c) => c.toString(16).padStart(2, '0')).join(''); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = Record<string, any>;

function addText(
  sl: PptxSlide, text: string,
  x: number, y: number, w: number, h: number, fontSize: number,
  opts: { bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; wrap?: boolean } = {},
): void {
  sl.addText(text, {
    x, y, w, h, fontSize,
    bold: opts.bold ?? false,
    color: opts.color ?? '333333',
    align: opts.align ?? 'left',
    wrap: opts.wrap ?? true,
    fontFace: 'Microsoft JhengHei',
  });
}

function addPanel(
  sl: PptxSlide, x: number, y: number, w: number, h: number,
  fill: string, border?: string,
): void {
  sl.addShape('roundRect' as PptxShapeType, {
    x, y, w, h,
    fill: { color: fill },
    line: border ? { color: border, width: 1 } : undefined,
    rectRadius: 0.15,
  });
}

function addBullets(
  sl: PptxSlide, items: string[], x: number, y: number, w: number, h: number, color: string,
): void {
  const text = items.slice(0, 8).map((item) => ({
    text: `• ${item.slice(0, 140)}`,
    options: { fontSize: 14, color, fontFace: 'Microsoft JhengHei', breakType: 'break' as const },
  }));
  sl.addText(text, { x, y, w, h, valign: 'top' });
}

/* ── 版面渲染器 ──────────────────────────────────────────────── */

function renderTitle(sl: PptxSlide, ss: Slide, p: Palette, deckTitle: string): void {
  addPanel(sl, 1.0, 1.25, 11.35, 4.6, hex(p.hero), hex(p.accent2));
  addText(sl, deckTitle, 1.0, 1.7, 11.33, 1.0, 26, { bold: true, color: hex(p.accent) });
  if (ss.subtitle) addText(sl, ss.subtitle, 1.05, 2.45, 5.8, 0.5, 14, { color: hex(p.muted) });
  addPanel(sl, 1.0, 3.3, 5.5, 1.95, hex(p.panel));
  addBullets(sl, ss.items ?? [], 1.25, 3.58, 4.9, 1.45, hex(p.muted));
  for (let i = 0; i < Math.min((ss.chips ?? []).length, 4); i++) {
    const cx = 1.05 + (i % 2) * 2.6, cy = 5.55 + Math.floor(i / 2) * 0.42;
    addPanel(sl, cx, cy, 2.35, 0.28, hex(p.panel_alt), hex(p.accent2));
    addText(sl, (ss.chips[i] as string).slice(0, 26), cx + 0.12, cy + 0.08, 2.1, 0.12, 10, { color: hex(p.text), align: 'center' });
  }
}

function renderBullets(sl: PptxSlide, ss: Slide, p: Palette): void {
  addPanel(sl, 0.75, 1.45, 11.85, 5.55, hex(p.panel));
  addBullets(sl, ss.items ?? [], 1.0, 1.72, 11.2, 5.0, hex(p.muted));
}

function renderCompare(sl: PptxSlide, ss: Slide, p: Palette): void {
  addPanel(sl, 0.75, 1.55, 4.5, 5.2, hex(p.panel));
  addPanel(sl, 5.5, 1.55, 4.5, 5.2, hex(p.panel));
  addPanel(sl, 10.2, 1.55, 2.05, 5.2, hex(p.panel_alt), hex(p.accent2));
  addText(sl, ss.left_title ?? '左側', 1.0, 1.75, 5.0, 0.4, 16, { bold: true, color: hex(p.accent2) });
  addText(sl, ss.right_title ?? '右側', 5.75, 1.75, 4.0, 0.4, 16, { bold: true, color: hex(p.accent) });
  addBullets(sl, ss.left_items ?? [], 1.0, 2.2, 3.9, 4.2, hex(p.muted));
  addBullets(sl, ss.right_items ?? [], 5.75, 2.2, 3.9, 4.2, hex(p.muted));
  addText(sl, 'VS', 10.52, 3.25, 1.45, 0.4, 16, { bold: true, color: hex(p.accent2), align: 'center' });
}

function renderTable(sl: PptxSlide, ss: Slide, p: Palette): void {
  const headers: string[] = ss.headers ?? [];
  const rows: string[][] = ss.rows ?? [];
  if (headers.length > 0 && rows.length > 0) {
    const tableRows = [headers.map((h: string) => ({ text: h.slice(0, 40), options: { bold: true, fontSize: 12, color: hex(p.text), fill: { color: hex(p.panel_alt) } } })),
      ...rows.slice(0, 4).map((row: string[]) => row.slice(0, headers.length).map((c: string) => ({ text: c.slice(0, 80), options: { fontSize: 11, color: hex(p.text) } })))];
    sl.addTable(tableRows, { x: 0.85, y: 1.65, w: 11.6, colW: Array(headers.length).fill(11.6 / headers.length), border: { type: 'solid', color: hex(p.muted), pt: 0.5 } });
  }
}

function renderMetrics(sl: PptxSlide, ss: Slide, p: Palette): void {
  const entries = (ss.metric_items as Array<Record<string, string>>) ?? buildMetricEntries(ss.items ?? []);
  for (let i = 0; i < Math.min(entries.length, 4); i++) {
    const e = entries[i];
    const x = 0.95 + (i % 2) * 5.7, y = 1.65 + Math.floor(i / 2) * 2.45;
    addPanel(sl, x, y, 5.1, 1.9, hex(p.panel));
    addText(sl, (e.value ?? '01').slice(0, 16), x + 0.28, y + 0.18, 2.2, 0.55, 22, { bold: true, color: hex(p.accent) });
    addText(sl, (e.label ?? '關鍵指標').slice(0, 54), x + 0.28, y + 0.8, 4.45, 0.34, 13, { color: hex(p.text) });
    addText(sl, (e.detail ?? '重點觀察').slice(0, 72), x + 0.28, y + 1.22, 4.05, 0.22, 9, { color: hex(p.muted) });
  }
}

function renderTimeline(sl: PptxSlide, ss: Slide, p: Palette): void {
  sl.addShape('rect' as PptxShapeType, { x: 1.15, y: 3.55, w: 10.7, h: 0.04, fill: { color: hex(p.accent) } });
  const entries = (ss.timeline_items as Array<Record<string, string>>) ?? buildTimelineEntries(ss.items ?? []);
  for (let i = 0; i < Math.min(entries.length, 5); i++) {
    const e = entries[i];
    const x = 1.0 + i * 2.55;
    const even = i % 2 === 0;
    addPanel(sl, x - 0.75, even ? 1.62 : 3.82, 1.85, 1.18, hex(p.panel));
    addText(sl, (e.title ?? '').slice(0, 26), x - 0.58, even ? 1.92 : 4.08, 1.5, 0.22, 10, { bold: true, color: hex(p.text), align: 'center' });
    addText(sl, (e.detail ?? '').slice(0, 40), x - 0.62, even ? 2.24 : 4.36, 1.56, 0.32, 8, { color: hex(p.muted), align: 'center' });
  }
}

function renderSources(sl: PptxSlide, ss: Slide, p: Palette): void {
  const entries = (ss.source_items as Array<Record<string, unknown>>) ?? buildSourceEntries(ss.items ?? [], ss.notes ?? []);
  for (let i = 0; i < Math.min(entries.length, 6); i++) {
    const e = entries[i];
    const x = 0.95 + (i % 2) * 5.7, y = 1.58 + Math.floor(i / 2) * 1.58;
    addPanel(sl, x, y, 5.1, 1.25, hex(p.panel));
    addText(sl, String(e.index ?? i + 1).padStart(2, '0'), x + 0.22, y + 0.18, 0.5, 0.32, 11, { bold: true, color: hex(p.accent) });
    addText(sl, String(e.kind ?? '研究來源').slice(0, 22), x + 0.72, y + 0.12, 1.4, 0.18, 8, { bold: true, color: hex(p.accent2) });
    addText(sl, String(e.label ?? '未命名來源').slice(0, 86), x + 0.72, y + 0.34, 4.05, 0.34, 12, { bold: true, color: hex(p.text) });
    addText(sl, String(e.detail ?? '').slice(0, 78), x + 0.72, y + 0.72, 4.0, 0.28, 9, { color: hex(p.muted) });
  }
}

function renderArchitecture(sl: PptxSlide, ss: Slide, p: Palette): void {
  const items: string[] = ss.items ?? [];
  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const y = 1.7 + i * 1.18, x = 1.2 + i * 0.25, w = 10.2 - i * 0.5;
    addPanel(sl, x, y, w, 0.82, hex(p.panel));
    addText(sl, `L${i + 1}`, x + 0.3, y + 0.22, 0.28, 0.16, 9, { bold: true, color: hex(p.text), align: 'center' });
    addText(sl, items[i].slice(0, 100), x + 0.9, y + 0.18, w - 1.2, 0.4, 15, { bold: true, color: hex(p.accent) });
  }
}

function renderQuote(sl: PptxSlide, ss: Slide, p: Palette): void {
  addPanel(sl, 0.95, 1.7, 10.9, 2.4, hex(p.panel_alt), hex(p.accent));
  addText(sl, `"${(ss.quote ?? '').slice(0, 220)}"`, 1.25, 2.0, 10.2, 1.4, 18, { bold: true, color: hex(p.text), align: 'center' });
  addPanel(sl, 1.15, 4.55, 10.5, 1.9, hex(p.panel));
  addBullets(sl, (ss.items ?? []).slice(0, 3), 1.4, 4.85, 9.9, 1.4, hex(p.muted));
}

function renderGallery(sl: PptxSlide, ss: Slide, p: Palette): void {
  const items: string[] = ss.items ?? [];
  for (let i = 0; i < 4; i++) {
    const x = 0.95 + (i % 2) * 5.85, y = 1.6 + Math.floor(i / 2) * 2.35;
    addPanel(sl, x, y, 5.2, 2.0, hex(p.panel_alt), hex(p.accent2));
    addText(sl, 'IMAGE', x + 1.55, y + 0.58, 2.0, 0.4, 18, { bold: true, color: hex(p.accent), align: 'center' });
  }
  if (items.length > 0) {
    addPanel(sl, 1.05, 6.45, 11.2, 0.38, hex(p.panel_alt), hex(p.accent2));
    addText(sl, items.map((n) => n.slice(0, 36)).join('  ·  '), 1.25, 6.55, 10.8, 0.16, 10, { color: hex(p.muted), align: 'center' });
  }
}

/* ── 主入口 ──────────────────────────────────────────────────── */

/** 將 slide spec 轉換為 PPTX Buffer。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildPptx(spec: Record<string, any>): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  const p = PALETTES[spec.style ?? 'notion'] ?? PALETTES.notion;

  const renderers: Record<string, (sl: PptxSlide, ss: Slide, p: Palette) => void> = {
    bullets: renderBullets, summary: renderBullets, compare: renderCompare,
    table: renderTable, metrics: renderMetrics, timeline: renderTimeline,
    sources: renderSources, architecture: renderArchitecture,
    quote: renderQuote, gallery: renderGallery,
  };

  for (const ss of spec.slides ?? []) {
    const sl = pptx.addSlide();
    sl.background = { fill: hex(p.bg) };
    const layout = ss.layout ?? 'bullets';

    if (layout === 'title') {
      renderTitle(sl, ss, p, spec.title ?? '');
    } else {
      addText(sl, (ss.title ?? spec.title ?? '').slice(0, 80), 0.7, 0.35, 12.0, 0.7, 22, { bold: true, color: hex(p.accent) });
      sl.addShape('rect' as PptxShapeType, { x: 0.7, y: 1.15, w: 12.0, h: 0.02, fill: { color: hex(p.accent2) } });
      (renderers[layout] ?? renderBullets)(sl, ss, p);
    }
  }

  const data = await pptx.write({ outputType: 'nodebuffer' });
  return data as Buffer;
}
