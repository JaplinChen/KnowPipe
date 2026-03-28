import { rm } from 'node:fs/promises';
import { logger } from '../../core/logger.js';
import type { ExtractedContent } from '../../extractors/types.js';
import { saveToVault, type SaveResult } from '../../saver.js';
import { recordSave } from '../../memory/memory-store.js';

export async function saveExtractedContent(
  content: ExtractedContent,
  vaultPath: string,
  opts?: { saveVideos?: boolean; userId?: number },
): Promise<SaveResult> {
  const result = await saveToVault(content, vaultPath, opts);
  if (content.tempDir) {
    rm(content.tempDir, { recursive: true, force: true }).catch(() => {});
  }
  logger.info('msg', 'saved', { mdPath: result.mdPath });

  // Record save event for preference memory (fire-and-forget)
  if (opts?.userId && !result.duplicate) {
    recordSave(
      opts.userId,
      content.category ?? '其他',
      content.enrichedKeywords ?? [],
      content.platform,
      content.title,
    ).catch(() => {});
  }

  return result;
}
