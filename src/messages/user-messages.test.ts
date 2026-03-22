import { describe, expect, it } from 'vitest';
import type { ExtractedContent } from '../extractors/types.js';
import {
  AI_TRANSCRIPT_PREFIX,
  STAGE,
  formatDuplicateMessage,
  formatProcessingMessage,
  formatSavedSummary,
  formatUnsupportedUrlMessage,
} from './user-messages.js';

function makeContent(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    platform: 'x',
    author: 'Alice',
    authorHandle: '@alice',
    title: 'Sample title',
    text: 'short text',
    images: [],
    videos: [],
    date: '2026-03-08',
    url: 'https://x.com/alice/status/1',
    category: '技術',
    ...overrides,
  };
}

describe('user-messages', () => {
  it('formats unsupported url message', () => {
    expect(formatUnsupportedUrlMessage('https://example.com')).toBe('不支援的連結：https://example.com');
  });

  it('formats processing message without stage', () => {
    const msg = formatProcessingMessage('youtube');
    expect(msg).toContain('youtube');
    expect(msg).toContain('⏳');
  });

  it('formats processing message with stage', () => {
    const msg = formatProcessingMessage('youtube', 'extracting');
    expect(msg).toContain('youtube');
    expect(msg).toContain(STAGE.extracting);
  });

  it('formats duplicate message', () => {
    expect(formatDuplicateMessage('/vault/abc.md')).toContain('/vault/abc.md');
  });

  it('formats saved summary with counts', () => {
    const content = makeContent({ comments: [{ author: 'u', authorHandle: '@u', text: 'long useful comment here', date: '2026-03-08' }] });
    const summary = formatSavedSummary(content, {
      mdPath: '/vault/a.md',
      imageCount: 2,
      videoCount: 1,
    });

    expect(summary).toContain('已儲存：Alice (@alice)');
    expect(summary).toContain('分類：技術');
    expect(summary).toContain('圖片：2');
    expect(summary).toContain('影片：1');
    expect(summary).toContain('評論：1');
    expect(summary).toContain('/vault/a.md');
  });

  it('uses transcript prefix constant', () => {
    expect(AI_TRANSCRIPT_PREFIX).toBe('\n\n文字稿：');
  });
});
