import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { ExtractedContent, Platform } from './extractors/types.js';
import { formatAsMarkdown } from './formatter.js';
import { fetchWithTimeout } from './utils/fetch-with-timeout.js';

// In-memory URL index: normalizedUrl → filePath (built on first use)
let urlIndex: Map<string, string> | null = null;

// URLs currently being processed (race condition protection)
const processingUrls = new Set<string>();

/** Extract a short, stable ID from a URL for use in filenames */
function extractPostId(url: string, platform: Platform): string {
  try {
    const u = new URL(url);
    switch (platform) {
      case 'x':
        return u.pathname.match(/\/status\/(\d+)/)?.[1] ?? 'unknown';
      case 'threads':
        return u.pathname.match(/\/post\/([\w-]+)/)?.[1] ?? 'unknown';
      case 'youtube':
        return u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop() ?? 'unknown';
      case 'github':
        return u.pathname.split('/').filter(Boolean).slice(0, 3).join('-').slice(0, 40);
      case 'reddit':
        return u.pathname.split('/').filter(Boolean)[3] ?? 'unknown';
      default:
        return createHash('md5').update(url).digest('hex').slice(0, 8);
    }
  } catch {
    return 'unknown';
  }
}

/** Convert a title string into a safe, readable filename slug */
function slugify(text: string, maxLen = 50): string {
  return text
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim();
}

/** Download a single image and return the local file path (relative to vault) */
async function downloadImage(
  imageUrl: string,
  destDir: string,
  filename: string,
): Promise<string> {
  const res = await fetchWithTimeout(imageUrl, 30_000);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status} ${imageUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = extname(new URL(imageUrl).pathname) || '.jpg';
  const fullName = `${filename}${ext}`;
  const fullPath = join(destDir, fullName);
  await writeFile(fullPath, buffer);
  return `attachments/getthreads/${fullName}`;
}

export interface SaveResult {
  mdPath: string;
  imageCount: number;
  videoCount: number;
  duplicate?: boolean;
}

/** Normalise a URL for dedup comparison: strip query string, keep only origin + pathname */
function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

/** Build URL index by scanning all .md files (runs once, then cached in memory). */
async function buildUrlIndex(vaultPath: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const rootDir = join(vaultPath, 'GetThreads');

  async function scanDir(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
    } catch { return; }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const raw = await readFile(fullPath, 'utf-8');
          const first25 = raw.split('\n').slice(0, 25).join('\n');
          const match = first25.match(/^url:\s*["']?(.*?)["']?\s*$/m);
          if (match) index.set(normaliseUrl(match[1].trim()), fullPath);
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await scanDir(rootDir);
  return index;
}

/** Check for duplicate URL using in-memory cache (O(1) after first scan). */
async function isDuplicateUrl(url: string, vaultPath: string): Promise<string | null> {
  if (!urlIndex) urlIndex = await buildUrlIndex(vaultPath);
  return urlIndex.get(normaliseUrl(url)) ?? null;
}

/** Save extracted content as Obsidian Markdown + images to the vault */
export async function saveToVault(
  content: ExtractedContent,
  vaultPath: string,
  opts?: { forceOverwrite?: boolean },
): Promise<SaveResult> {
  const normUrl = normaliseUrl(content.url);

  // Race condition guard (skip for forceOverwrite)
  if (!opts?.forceOverwrite) {
    if (processingUrls.has(normUrl)) {
      return { mdPath: '', imageCount: 0, videoCount: 0, duplicate: true };
    }
    processingUrls.add(normUrl);
  }

  try {
    // Dedup check (skipped when forceOverwrite)
    if (!opts?.forceOverwrite) {
      const existingPath = await isDuplicateUrl(content.url, vaultPath);
      if (existingPath) {
        return { mdPath: existingPath, imageCount: 0, videoCount: 0, duplicate: true };
      }
    }

    const postId = extractPostId(content.url, content.platform);

    // Ensure directories exist
    const rawCategory = content.category ?? '其他';
    const categoryParts = rawCategory
      .split('/')
      .slice(0, 2)
      .map(p => p.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\-_ ]/g, '').trim())
      .filter(p => p.length > 0);
    const folderPath = categoryParts.join('/') || '其他';
    const baseGetThreads = resolve(join(vaultPath, 'GetThreads'));
    const resolvedNotes = resolve(join(vaultPath, 'GetThreads', folderPath));
    const notesDir = (resolvedNotes === baseGetThreads || resolvedNotes.startsWith(baseGetThreads + sep))
      ? resolvedNotes
      : baseGetThreads;
    const imagesDir = join(vaultPath, 'attachments', 'getthreads');
    await mkdir(notesDir, { recursive: true });
    await mkdir(imagesDir, { recursive: true });

    // Download images in parallel
    const imageResults = await Promise.allSettled(
      content.images.map((imgUrl, i) =>
        downloadImage(imgUrl, imagesDir, `${content.platform}-${postId}-${i}`),
      ),
    );
    const localImagePaths = imageResults
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value);

    // Download video thumbnails in parallel
    for (const r of await Promise.allSettled(
      content.videos.map((v, i) =>
        v.thumbnailUrl
          ? downloadImage(v.thumbnailUrl, imagesDir, `${content.platform}-${postId}-vid${i}-thumb`)
          : Promise.reject('no thumbnail'),
      ),
    )) {
      if (r.status === 'fulfilled') localImagePaths.push(r.value);
    }

    // Generate Markdown
    const markdown = formatAsMarkdown(content, localImagePaths);

    // Save .md file with readable name
    const ERROR_TITLE_RE = /^(warning[:\s]|error\s*\d{3}|access denied|forbidden|you've been blocked)/i;
    let titleForFilename = content.title;
    if (ERROR_TITLE_RE.test(titleForFilename)) {
      try {
        titleForFilename = new URL(content.url).hostname.replace(/^www\./, '');
      } catch {
        titleForFilename = 'untitled';
      }
    }
    const slug = slugify(titleForFilename);
    const mdFilename = `${content.date}-${content.platform}-${slug}.md`;
    const mdPath = join(notesDir, mdFilename);
    await writeFile(mdPath, markdown, 'utf-8');

    // Update in-memory index
    if (urlIndex) urlIndex.set(normUrl, mdPath);

    return { mdPath, imageCount: localImagePaths.length, videoCount: content.videos.length };
  } finally {
    processingUrls.delete(normUrl);
  }
}
