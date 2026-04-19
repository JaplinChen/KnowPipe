import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invalidateUrlIndex, updateUrlIndex } from './saver-url-index.js';

// TTL 和 invalidateUrlIndex 的行為測試
// isDuplicateUrl 需要掃描 vault 檔案，不在此單元測試範圍

describe('invalidateUrlIndex', () => {
  it('可以不拋錯執行', () => {
    expect(() => invalidateUrlIndex()).not.toThrow();
  });

  it('連續呼叫也不拋錯', () => {
    invalidateUrlIndex();
    invalidateUrlIndex();
    expect(() => invalidateUrlIndex()).not.toThrow();
  });
});

describe('updateUrlIndex', () => {
  beforeEach(() => {
    invalidateUrlIndex();
  });

  it('index 為 null 時不拋錯（index 尚未建立）', () => {
    // urlIndex 在 invalidateUrlIndex 後是 null，updateUrlIndex 應靜默跳過
    expect(() => updateUrlIndex('https://example.com', '/vault/note.md')).not.toThrow();
  });
});
