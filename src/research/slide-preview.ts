/**
 * 投影片 HTML 預覽渲染器 — 移植自 slide_render.py。
 * 產生完整 HTML 頁面含嵌入 CSS。
 */

/* ── 工具 ────────────────────────────────────────────────────── */

function esc(text: string): string {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── 元件渲染 ────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = Record<string, any>;

function metricRichHtml(entries: Array<Record<string, string>>): string {
  return `<div class="metric-grid">${entries.slice(0, 4).map((e) =>
    `<div class="metric-card metric-card-rich"><div class="metric-value">${esc(e.value ?? '01')}</div>`
    + `<div class="metric-label metric-label-strong">${esc(e.label ?? '關鍵指標')}</div>`
    + `<div class="metric-detail">${esc(e.detail ?? '重點觀察')}</div></div>`
  ).join('')}</div>`;
}

function timelineRichHtml(entries: Array<Record<string, string>>): string {
  return `<div class="timeline-track">${entries.slice(0, 5).map((e, i) => {
    const side = (i + 1) % 2 ? 'top' : 'bottom';
    return `<div class="timeline-node ${side}"><div class="timeline-dot"></div>`
      + `<div class="timeline-step">${esc(e.stage ?? `0${i + 1}`)}</div>`
      + `<div class="timeline-text"><strong>${esc(e.title ?? '')}</strong>`
      + `<span>${esc(e.detail ?? '')}</span></div></div>`;
  }).join('')}</div>`;
}

function sourcesRichHtml(entries: Array<Record<string, string>>): string {
  return `<div class="source-grid">${entries.slice(0, 6).map((e) =>
    `<div class="source-card source-card-rich"><div class="source-index">${String(e.index ?? 0).padStart(2, '0')}</div>`
    + `<div class="source-body"><div class="source-kind">${esc(e.kind ?? '研究來源')}</div>`
    + `<div class="source-title">${esc(e.label ?? '未命名來源')}</div>`
    + `<div class="source-detail">${esc(e.detail ?? '')}</div></div></div>`
  ).join('')}</div>`;
}

function architectureHtml(items: string[]): string {
  return `<div class="arch-stack">${items.slice(0, 4).map((item, i) =>
    `<div class="arch-layer" style="width:${96 - i * 10}%">`
    + `<span class="arch-badge">L${i + 1}</span><span class="arch-text">${esc(item)}</span></div>`
  ).join('')}</div>`;
}

function placeholderHtml(kind: string): string {
  const label = esc(kind || 'visual');
  return `<div class="image-placeholder"><div class="image-icon">${label.charAt(0).toUpperCase()}</div>`
    + `<div class="image-caption">${label}</div></div>`;
}

/* ── 版面渲染 ────────────────────────────────────────────────── */

function renderSlide(slide: Slide, idx: number, deckTitle: string): string {
  const title = esc(slide.title ?? '');
  const layout = slide.layout ?? 'bullets';
  const visual = slide.visual ?? {};
  let body = '';

  switch (layout) {
    case 'title': {
      const items = (slide.items ?? []) as string[];
      body = `<div class="grid-2">${items.map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</div>`;
      body += placeholderHtml('hero-panel');
      const chips = (slide.chips ?? []) as string[];
      if (chips.length) body += `<div class="hero-meta">${chips.slice(0, 4).map((c: string) => `<span class="hero-meta-chip">${esc(c)}</span>`).join('')}</div>`;
      break;
    }
    case 'summary':
    case 'bullets': {
      const items = (slide.items ?? []) as string[];
      const list = `<div class="list">${items.map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</div>`;
      const vk = visual.kind;
      if (vk && vk !== 'text-panel') {
        body = `<div class="visual-split">${list}${placeholderHtml(vk)}</div><div class="visual-note">${esc(vk)}</div>`;
      } else {
        body = list;
      }
      break;
    }
    case 'metrics':
      body = metricRichHtml(slide.metric_items ?? []);
      break;
    case 'timeline':
      body = timelineRichHtml(slide.timeline_items ?? []);
      break;
    case 'sources': {
      body = sourcesRichHtml(slide.source_items ?? []);
      const notes = (slide.notes ?? []) as string[];
      if (notes.length) body += `<div class="source-notes">${notes.slice(0, 3).map((n: string) => `<div class="source-note">${esc(n)}</div>`).join('')}</div>`;
      break;
    }
    case 'architecture':
      body = architectureHtml(slide.items ?? []);
      body += placeholderHtml(visual.kind ?? 'diagram');
      break;
    case 'compare': {
      const lh = `<section><h4>${esc(slide.left_title ?? '左側')}</h4>${((slide.left_items ?? []) as string[]).map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</section>`;
      const rh = `<section><h4>${esc(slide.right_title ?? '右側')}</h4>${((slide.right_items ?? []) as string[]).map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</section>`;
      body = `<div class="compare-wrap"><div class="compare">${lh}${rh}</div>${placeholderHtml(visual.kind ?? 'vs-diagram')}</div>`;
      const sums = (slide.compare_summary ?? []) as string[];
      if (sums.length) body += `<div class="compare-summary">${sums.slice(0, 3).map((t: string) => `<span class="compare-tag">${esc(t)}</span>`).join('')}</div>`;
      break;
    }
    case 'table': {
      const headers = (slide.headers ?? []) as string[];
      const rows = (slide.rows ?? []) as string[][];
      const th = headers.map((h: string) => `<th>${esc(h)}</th>`).join('');
      const tr = rows.map((row: string[]) => `<tr>${row.map((c: string) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
      body = `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
      break;
    }
    case 'quote': {
      const qe = slide.quote_entry ?? {};
      body = `<blockquote>${esc(slide.quote ?? '')}</blockquote>`;
      if (qe.source || qe.takeaway) {
        body += `<div class="quote-meta">${qe.source ? `<span class="quote-source">${esc(qe.source)}</span>` : ''}${qe.takeaway ? `<span class="quote-takeaway">${esc(qe.takeaway)}</span>` : ''}</div>`;
      }
      body += `<div class="list">${((slide.items ?? []) as string[]).map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</div>`;
      break;
    }
    case 'gallery':
      body = `<div class="gallery-grid">${placeholderHtml('gallery')}${placeholderHtml('gallery')}</div>`;
      break;
    default:
      body = `<div class="list">${((slide.items ?? []) as string[]).map((i: string) => `<div class="item">${esc(i)}</div>`).join('')}</div>`;
  }

  return `<article class="slide"><div class="num">${idx}</div><h3>${title}</h3><div class="layout">${layout}</div>${body}</article>`;
}

/* ── CSS ─────────────────────────────────────────────────────── */

const PALETTES: Record<string, Record<string, string>> = {
  notion: { bg: '#f7f3ea', card: '#fffdf8', text: '#1f2328', muted: '#6b7280', accent: '#b76e3a' },
  'technical-schematic': { bg: '#0f1117', card: '#181c27', text: '#eceef5', muted: '#9aa6c1', accent: '#4ec994' },
  corporate: { bg: '#f3f6fb', card: '#ffffff', text: '#14213d', muted: '#5c677d', accent: '#1d4ed8' },
};

const CSS = `*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:32px 24px 64px}.head{margin-bottom:28px}.head h1{margin:0 0 8px;font-size:34px}.meta{color:var(--muted);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
.slide{background:var(--card);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-radius:22px;padding:20px;box-shadow:0 12px 32px rgba(0,0,0,.08);min-height:250px;position:relative}
.num{position:absolute;right:18px;top:16px;color:var(--muted);font-size:12px}h3{margin:0 0 6px;font-size:22px}
.layout{color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}
.list,.grid-2{display:grid;gap:10px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.visual-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(220px,.95fr);gap:14px;align-items:stretch}
.item{background:rgba(127,127,127,.08);border-radius:14px;padding:10px 12px;line-height:1.55}
.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.metric-card{border-radius:18px;padding:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 14%,var(--card)),color-mix(in srgb,var(--accent) 4%,var(--card)));border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);min-height:120px}
.metric-card-rich{display:grid;gap:8px;align-content:start}.metric-value{font-size:32px;font-weight:800;line-height:1;color:var(--accent);margin-bottom:10px}
.metric-label{font-size:14px;line-height:1.6}.metric-label-strong{font-weight:700}.metric-detail{font-size:12px;color:var(--muted)}
.timeline-track{position:relative;padding:28px 8px 8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
.timeline-node{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:1}
.timeline-dot{width:18px;height:18px;border-radius:999px;background:var(--accent)}
.timeline-step{font-size:11px;color:var(--muted)}
.timeline-text{background:rgba(127,127,127,.08);border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.5;max-width:180px;display:grid;gap:6px}
.source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.source-card{display:flex;gap:10px;align-items:flex-start;background:rgba(127,127,127,.06);border-radius:16px;padding:12px}
.source-index{width:34px;height:34px;border-radius:12px;background:color-mix(in srgb,var(--accent) 16%,transparent);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--accent);font-weight:700}
.source-body{display:grid;gap:6px}.source-kind{font-size:11px;text-transform:uppercase;color:var(--accent)}.source-title{font-size:14px;font-weight:700}
.source-detail{font-size:13px;color:var(--muted)}
.source-notes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
.source-note{border-radius:14px;padding:10px 12px;background:rgba(127,127,127,.05);font-size:13px}
.arch-stack{display:flex;flex-direction:column;gap:12px;align-items:center}
.arch-layer{min-height:54px;border-radius:18px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 14%,var(--card)),rgba(127,127,127,.06));border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);display:flex;align-items:center;gap:12px;padding:12px 16px}
.arch-badge{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb,var(--accent) 18%,transparent);font-size:12px;font-weight:700;color:var(--accent)}
.image-placeholder{min-height:136px;border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,transparent),rgba(127,127,127,.04));border:1px solid color-mix(in srgb,var(--accent) 20%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin-top:14px}
.image-icon{width:48px;height:48px;border-radius:16px;background:color-mix(in srgb,var(--accent) 18%,var(--card));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--accent)}
.image-caption{font-size:12px;color:var(--muted);text-transform:uppercase}
.compare-wrap{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(220px,.85fr);gap:14px}
.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.compare section{background:rgba(127,127,127,.06);border-radius:16px;padding:12px}
.compare-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.compare-tag,.hero-meta-chip{display:inline-flex;padding:7px 11px;border-radius:999px;background:rgba(127,127,127,.08);border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);font-size:12px}
.hero-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}
.compare h4{margin:0 0 10px;color:var(--accent)}table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid rgba(127,127,127,.18);padding:8px 10px;text-align:left}th{background:rgba(127,127,127,.08)}
blockquote{margin:0 0 14px;padding:14px 16px;border-left:4px solid var(--accent);background:rgba(127,127,127,.06);border-radius:0 14px 14px 0;line-height:1.7}
.quote-meta{display:flex;gap:8px;margin:-2px 0 12px}.quote-source,.quote-takeaway{padding:7px 11px;border-radius:999px;background:rgba(127,127,127,.08);font-size:12px}
.visual-note{margin-top:12px;color:var(--muted);font-size:11px;text-transform:uppercase}`;

/* ── 公開 API ────────────────────────────────────────────────── */

/** 產生投影片預覽的完整 HTML 頁面。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderSlidePreviewHtml(spec: Record<string, any>): string {
  const style = spec.style ?? 'notion';
  const p = PALETTES[style] ?? PALETTES.notion;
  const deckTitle = spec.title ?? 'Slide Preview';

  const cards = ((spec.slides ?? []) as Slide[])
    .map((slide, i) => renderSlide(slide, i + 1, deckTitle))
    .join('');

  const cssVars = `--bg:${p.bg};--card:${p.card};--text:${p.text};--muted:${p.muted};--accent:${p.accent};`;

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deckTitle)}</title>
<style>:root{${cssVars}}${CSS}</style></head><body><div class="wrap">
<div class="head"><h1>${esc(deckTitle)}</h1>
<div class="meta">style: ${esc(style)} · topic: ${esc(spec.topic ?? '')}</div></div>
<div class="grid">${cards}</div></div></body></html>`;
}
