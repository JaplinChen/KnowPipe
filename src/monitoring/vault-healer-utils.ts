import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CorrectionEvent } from './health-types.js';
import { logger } from '../core/logger.js';

const CORRECTIONS_LOG = join('data', 'corrections-log.json');

const HTML_TAG_RE = /<(?:div|span|br|p|a|img|table|tr|td|th|ul|ol|li|h[1-6])\b[^>]*\/?>/gi;
const HTML_CLOSE_RE = /<\/(?:div|span|p|a|table|tr|td|th|ul|ol|li|h[1-6])>/gi;

export function stripHtml(text: string): string {
  return text
    .replace(HTML_TAG_RE, '')
    .replace(HTML_CLOSE_RE, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractSummaryFromBody(body: string): string {
  const lines = body.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[#>*\-|]/.test(line) && !/^!\[/.test(line));
  const text = lines.join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
  return text.slice(0, 150).replace(/\n/g, ' ');
}

export async function appendCorrections(events: CorrectionEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    let existing: CorrectionEvent[] = [];
    try {
      const raw = await readFile(CORRECTIONS_LOG, 'utf-8');
      existing = JSON.parse(raw) as CorrectionEvent[];
    } catch { /* 首次建立 */ }

    const updated = [...existing, ...events].slice(-500);
    await writeFile(CORRECTIONS_LOG, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    logger.warn('vault-healer', '修正日誌寫入失敗', { err: (err as Error).message });
  }
}
