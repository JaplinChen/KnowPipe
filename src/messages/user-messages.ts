import type { ExtractedContent } from '../extractors/types.js';
import type { SaveResult } from '../saver.js';

export function formatUnsupportedUrlMessage(url: string): string {
  return `不支援的連結：${url}`;
}

/** Processing stages with emoji indicators */
export const STAGE = {
  extracting: '🔍 擷取內容中…',
  enriching: '🧠 AI 豐富化中…',
  saving: '💾 儲存至 Vault…',
} as const;

export function formatProcessingMessage(platform: string, stage?: keyof typeof STAGE): string {
  const stageText = stage ? `\n${STAGE[stage]}` : '';
  return `⏳ 正在處理 ${platform} 連結…${stageText}`;
}

export function formatDuplicateMessage(mdPath: string): string {
  return `📋 已儲存過，略過：\n${mdPath}`;
}

export function formatSavedSummary(content: ExtractedContent, result: SaveResult): string {
  return [
    `✅ 已儲存：${content.author} (${content.authorHandle})`,
    `📂 分類：${content.category}`,
    '',
    content.text.length > 200 ? content.text.slice(0, 200) + '...' : content.text,
    '',
    `🖼 圖片：${result.imageCount} | 🎬 影片：${result.videoCount}${content.comments?.length ? ` | 💬 評論：${content.comments.length}` : ''}`,
    `📄 檔案：${result.mdPath}`,
  ].join('\n');
}

export const AI_TRANSCRIPT_PREFIX = '\n\n文字稿：';
