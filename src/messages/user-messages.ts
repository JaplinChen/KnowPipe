import { basename, relative } from 'node:path';
import type { ExtractedContent } from '../extractors/types.js';
import type { SaveResult } from '../saver.js';

/** Escape HTML special characters for Telegram HTML parse mode */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build an obsidian:// URI that opens the note directly in Obsidian */
export function buildObsidianUri(vaultPath: string, absoluteMdPath: string): string {
  const vaultName = basename(vaultPath);
  const relPath = relative(vaultPath, absoluteMdPath);
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relPath)}`;
}

export function formatUnsupportedUrlMessage(url: string): string {
  return `不支援的連結：${url}`;
}

/** Processing stages with emoji indicators */
export const STAGE = {
  extracting: '🔍 擷取內容中…',
  enriching: '🧠 AI 豐富化中…',
  reviewing: '🔎 品質審查中…',
  saving: '💾 儲存至 Vault…',
} as const;

export function formatProcessingMessage(platform: string, stage?: keyof typeof STAGE): string {
  const stageText = stage ? `\n${STAGE[stage]}` : '';
  return `⏳ 正在處理 ${platform} 連結…${stageText}`;
}

export function formatDuplicateMessage(mdPath: string, vaultPath?: string): string {
  if (vaultPath) {
    const fileName = mdPath.split('/').pop() ?? mdPath;
    const uri = buildObsidianUri(vaultPath, mdPath);
    return `📋 已儲存過，略過：\n<a href="${uri}">${escapeHtml(fileName)}</a>`;
  }
  return `📋 已儲存過，略過：\n${mdPath}`;
}

export function formatSavedSummary(content: ExtractedContent, result: SaveResult, vaultPath?: string): string {
  const fileName = result.mdPath.split('/').pop() ?? 'note.md';
  const fileDisplay = vaultPath
    ? `<a href="${buildObsidianUri(vaultPath, result.mdPath)}">${escapeHtml(fileName)}</a>`
    : result.mdPath;
  // Prefer AI-enriched summary over raw text for consistency with Obsidian note
  const displayText = content.enrichedSummary ?? content.text;
  const text = displayText.length > 200 ? displayText.slice(0, 200) + '...' : displayText;

  const lines = [
    `✅ <b>${escapeHtml(content.title)}</b>`,
    `👤 ${escapeHtml(content.author)} (${escapeHtml(content.authorHandle)}) | 📂 ${escapeHtml(content.category ?? '其他')}`,
    '',
    escapeHtml(text),
    '',
    `🖼 圖片：${result.imageCount} | 🎬 影片：${result.videoCount}${content.comments?.length ? ` | 💬 評論：${content.comments.length}` : ''}`,
    `📄 ${fileDisplay}`,
  ];
  return lines.join('\n');
}

export const AI_TRANSCRIPT_PREFIX = '\n\n文字稿：';
