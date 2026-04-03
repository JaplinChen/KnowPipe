/**
 * Vault 掃描與筆記載入 — server-side 版本。
 * 複用現有 frontmatter-utils 的解析邏輯。
 */
import { readFile } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import { getAllMdFiles, parseFrontmatter, parseArrayField } from '../vault/frontmatter-utils.js';
import type { NoteRecord } from './types.js';

const PREVIEW_CHARS = 280;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

/* ── Frontmatter → NoteRecord ────────────────────────────────── */

function parseNote(filePath: string, vaultRoot: string, raw: string): NoteRecord {
  const relPath = relative(vaultRoot, filePath);
  const name = basename(filePath, '.md');
  const folder = dirname(relPath) || '.';

  // 分離 frontmatter 與 body
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const body = fmMatch ? raw.slice(fmMatch[0].length).trim() : raw;
  const fm = parseFrontmatter(raw);

  const tagsRaw = fm.get('tags') ?? '';
  const keywordsRaw = fm.get('keywords') ?? '';

  return {
    name,
    path: relPath,
    folder,
    body,
    preview: body.slice(0, PREVIEW_CHARS),
    tags: parseArrayField(tagsRaw),
    keywords: parseArrayField(keywordsRaw),
    category: fm.get('category') ?? '',
    size: Buffer.byteLength(raw, 'utf-8'),
    mtime: 0, // 由呼叫端填入
  };
}

/* ── 公開 API ────────────────────────────────────────────────── */

/**
 * 掃描 Vault 中所有 .md 筆記，回傳 NoteRecord 陣列。
 */
export async function scanVaultNotes(vaultPath: string): Promise<NoteRecord[]> {
  const mdFiles = await getAllMdFiles(vaultPath);
  const notes: NoteRecord[] = [];

  for (const filePath of mdFiles) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const note = parseNote(filePath, vaultPath, raw);
      notes.push(note);
    } catch {
      // 跳過無法讀取的檔案
    }
  }

  return notes.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 載入單篇筆記的完整 body。
 */
export async function loadNoteBody(vaultPath: string, notePath: string): Promise<string> {
  const fullPath = join(vaultPath, notePath);
  const raw = await readFile(fullPath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  return fmMatch ? raw.slice(fmMatch[0].length).trim() : raw;
}

/**
 * 搜尋筆記：比對標題、標籤、body 中的關鍵字。
 */
export function searchNotes(notes: NoteRecord[], query: string): NoteRecord[] {
  if (!query.trim()) return notes;
  const q = query.toLowerCase();
  return notes.filter((n) => {
    const searchable = [n.name, ...n.tags, ...n.keywords, n.category, n.preview].join(' ').toLowerCase();
    return searchable.includes(q);
  });
}

/**
 * 組裝 LLM 系統 prompt 所需的筆記上下文。
 * 最多取 8 篇、30,000 字元。
 */
export function buildNoteContext(notes: NoteRecord[], topic: string, maxChars = 30_000): string {
  let total = 0;
  const parts: string[] = [];

  for (let i = 0; i < Math.min(notes.length, 8); i++) {
    const n = notes[i];
    const chunk = (n.body || n.preview || '').slice(0, 5000);
    total += chunk.length;
    if (total > maxChars && i >= 3) break;

    const tagLine = n.tags.length > 0 ? `tags: ${n.tags.join(', ')}` : '';
    parts.push(`=== 筆記${i + 1}：${n.name} ===\n${tagLine}\n${chunk}`);
  }

  const srcs = parts.join('\n\n---\n\n');
  return `你是「${topic}」主題的研究助手，熟悉用戶的 Obsidian 筆記。\n`
    + '用繁體中文回答，深入有結構，使用 Markdown（# ## ### #### 標題、表格、- 清單、**粗體**、> 引言、```程式碼```）。\n'
    + '引用筆記時用 [[筆記名稱]] 標注來源。\n\n'
    + (srcs ? `已選取 ${notes.length} 篇筆記：\n\n${srcs}` : '（未選取筆記，使用通用知識）');
}

/**
 * 列出 Vault 中的圖片資產路徑。
 */
export async function scanVaultAssets(vaultPath: string): Promise<string[]> {
  const { readdir, stat } = await import('node:fs/promises');
  const assets: string[] = [];

  async function walk(dir: string): Promise<void> {
    try {
      for (const entry of await readdir(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isDirectory()) {
          await walk(full);
        } else if (IMAGE_EXT_RE.test(entry)) {
          assets.push(relative(vaultPath, full));
        }
      }
    } catch { /* skip */ }
  }

  await walk(vaultPath);
  return assets;
}
