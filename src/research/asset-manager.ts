/**
 * 圖片資產管理 — 探索、評分、投影片配對。
 * 移植自 ObsVaultResearch app-assets.js。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

export interface AssetRecord {
  name: string;
  path: string;       // 相對於 vault root
  folder: string;
  ext: string;
  size: number;
}

/* ── 掃描 ────────────────────────────────────────────────────── */

/** 掃描 Vault 中所有圖片資產。 */
export async function scanAssets(vaultPath: string): Promise<AssetRecord[]> {
  const assets: AssetRecord[] = [];
  const skip = new Set(['.obsidian', '.trash', 'node_modules', '.git']);

  async function walk(dir: string): Promise<void> {
    try {
      for (const entry of await readdir(dir)) {
        if (entry.startsWith('.') && skip.has(entry)) continue;
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isDirectory() && !skip.has(entry)) {
          await walk(full);
        } else if (IMAGE_EXT.has(extname(entry).toLowerCase())) {
          const rel = relative(vaultPath, full);
          assets.push({
            name: entry,
            path: rel,
            folder: relative(vaultPath, dir) || '.',
            ext: extname(entry).slice(1).toLowerCase(),
            size: s.size,
          });
        }
      }
    } catch { /* skip */ }
  }

  await walk(vaultPath);
  return assets;
}

/* ── 圖片參考解析 ────────────────────────────────────────────── */

/** 從 Markdown 中提取圖片參考。 */
export function extractImageRefs(markdown: string): string[] {
  const refs: string[] = [];

  // ![[wikilink images]]
  for (const m of markdown.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    refs.push(m[1].split('|')[0].trim());
  }
  // ![alt](url)
  for (const m of markdown.matchAll(/!\[.*?\]\(([^)]+)\)/g)) {
    const src = m[1].trim();
    if (!src.startsWith('http')) refs.push(src);
  }

  return refs;
}

/* ── 評分 ────────────────────────────────────────────────────── */

/** 推斷圖片角色。 */
export function inferAssetRole(name: string): string {
  const n = name.toLowerCase();
  if (['cover', 'hero', 'banner'].some((t) => n.includes(t))) return 'cover';
  if (['diagram', 'arch', 'flow', 'pipeline'].some((t) => n.includes(t))) return 'diagram';
  if (['compare', 'vs', 'diff'].some((t) => n.includes(t))) return 'compare';
  if (['timeline', 'history', 'evolution'].some((t) => n.includes(t))) return 'timeline';
  return 'support';
}

/** 評分圖片與投影片的匹配程度。 */
export function scoreAssetForSlide(
  asset: AssetRecord,
  slideTitle: string,
  slideLayout: string,
): number {
  let score = 0;
  const name = asset.name.toLowerCase();
  const title = slideTitle.toLowerCase();

  // 名稱與標題重疊
  const titleWords = title.match(/[a-z]{3,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const w of titleWords) {
    if (name.includes(w)) score += 3;
  }

  // 角色與版面匹配
  const role = inferAssetRole(asset.name);
  if (slideLayout === 'title' && role === 'cover') score += 5;
  if (slideLayout === 'architecture' && role === 'diagram') score += 5;
  if (slideLayout === 'compare' && role === 'compare') score += 4;
  if (slideLayout === 'timeline' && role === 'timeline') score += 4;

  // 圖片大小偏好（太小的可能是 icon）
  if (asset.size > 50_000) score += 1;
  if (asset.size > 200_000) score += 1;

  return score;
}

/* ── 投影片圖片配對 ────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlideSpec = Record<string, any>;

/**
 * 為投影片規格中的每張投影片配對最佳圖片。
 * 回傳更新後的 spec（原地修改 slides）。
 */
export function enrichSlideSpecWithAssets(
  spec: SlideSpec,
  assets: AssetRecord[],
): SlideSpec {
  if (!assets.length || !spec.slides?.length) return spec;

  const used = new Set<string>();

  for (const slide of spec.slides) {
    const layout = slide.layout ?? 'bullets';
    const title = slide.title ?? '';

    // 只為特定版面配圖
    if (!['title', 'summary', 'architecture', 'compare', 'bullets'].includes(layout)) continue;

    let bestAsset: AssetRecord | null = null;
    let bestScore = 0;

    for (const asset of assets) {
      if (used.has(asset.path)) continue;
      const score = scoreAssetForSlide(asset, title, layout);
      if (score > bestScore) {
        bestScore = score;
        bestAsset = asset;
      }
    }

    if (bestAsset && bestScore >= 2) {
      slide.image = { path: bestAsset.path, caption: bestAsset.name };
      used.add(bestAsset.path);
    }
  }

  return spec;
}

/** 將圖片檔案轉為 data URL（供 PPTX 嵌入）。 */
export async function assetToDataUrl(vaultPath: string, assetPath: string): Promise<string> {
  const fullPath = join(vaultPath, assetPath);
  const buf = await readFile(fullPath);
  const ext = extname(assetPath).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}
