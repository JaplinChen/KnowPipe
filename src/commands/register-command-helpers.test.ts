import { describe, expect, it, vi } from 'vitest';
import {
  createForceReplyRunner,
  mutateContextMessageText,
  registerActionSet,
  registerCommandSet,
} from './register-command-helpers.js';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('register-command-helpers', () => {
  it('registerCommandSet wires commands to their handlers', async () => {
    const commandCallbacks = new Map<string, (ctx: unknown) => void>();
    const bot = {
      command: vi.fn((command: string, cb: (ctx: unknown) => void) => {
        commandCallbacks.set(command, cb);
      }),
    } as never;
    const handler = vi.fn(async () => {});
    const ctx = { reply: vi.fn(async () => ({})) };

    registerCommandSet(bot, {} as never, [
      { command: 'ask', tag: 'ask', handler },
    ]);

    commandCallbacks.get('ask')?.(ctx);
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledWith(ctx, {});
  });

  it('registerActionSet wires actions to matched handlers', async () => {
    const actionCallbacks = new Map<string, (ctx: unknown) => void>();
    const bot = {
      action: vi.fn((pattern: RegExp, cb: (ctx: unknown) => void) => {
        actionCallbacks.set(pattern.source, cb);
      }),
    } as never;
    const handler = vi.fn(async () => {});
    const ctx = { match: ['nav:discover', 'discover'], reply: vi.fn(async () => ({})) };

    registerActionSet(bot, [
      { pattern: /^nav:(.+)$/, tag: 'nav', handler },
    ]);

    actionCallbacks.get('^nav:(.+)$')?.(ctx);
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it('createForceReplyRunner binds config to the handler', async () => {
    const ctx = { reply: vi.fn(async () => ({})) };
    const config = { test: true };
    const handler = vi.fn(async () => {});

    await createForceReplyRunner(config as never, handler, 'force-reply')(ctx as never);

    expect(handler).toHaveBeenCalledWith(ctx, config);
  });

  it('mutateContextMessageText updates existing message text in-place', () => {
    const ctx = {
      message: { text: 'old text' },
      update: {},
    };

    mutateContextMessageText(ctx as never, 'new text');

    expect(ctx.message.text).toBe('new text');
  });

  it('mutateContextMessageText creates a synthetic message from callback payload when needed', () => {
    const ctx = {
      callbackQuery: { message: { message_id: 5, chat: { id: 8 } } },
      update: {},
    };

    mutateContextMessageText(ctx as never, '/reprocess a b c');

    expect((ctx.update as { message?: { text?: string } }).message).toEqual({
      message_id: 5,
      chat: { id: 8 },
      text: '/reprocess a b c',
    });
  });
});
