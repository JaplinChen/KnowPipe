import { describe, expect, it } from 'vitest';
import { buildCallbackData, resolveCallbackPayload, resolveCallbackToken } from './knowledge-query-command.js';

describe('knowledge callback payload mapping', () => {
  it('resolves tokenized payload back to original text', () => {
    const callbackData = buildCallbackData('recommend', 'very long topic name');
    const token = callbackData.split(':')[1];
    expect(resolveCallbackPayload('recommend', token)).toBe('very long topic name');
  });

  it('falls back to original value when token is unknown', () => {
    expect(resolveCallbackPayload('recommend', 'plain-text-topic')).toBe('plain-text-topic');
  });

  it('returns null for unknown strict token', () => {
    expect(resolveCallbackToken('recommend', 'plain-text-topic')).toBeNull();
  });
});
