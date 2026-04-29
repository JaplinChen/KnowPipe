import { describe, expect, it, vi } from 'vitest';
import { withStatusMessage } from './command-runner.js';

function createMockContext() {
  return {
    reply: vi.fn(async () => ({ message_id: 42, chat: { id: 7 }, text: 'status' })),
    deleteMessage: vi.fn(async () => {}),
  } as const;
}

describe('withStatusMessage', () => {
  it('passes the status message to the task and deletes it after success', async () => {
    const ctx = createMockContext();
    const task = vi.fn(async (status: { message_id: number }) => status.message_id + 1);

    const result = await withStatusMessage(ctx as never, 'working...', task);

    expect(result).toBe(43);
    expect(ctx.reply).toHaveBeenCalledWith('working...');
    expect(task).toHaveBeenCalledWith(expect.objectContaining({ message_id: 42 }));
    expect(ctx.deleteMessage).toHaveBeenCalledWith(42);
  });

  it('still deletes the status message when the task fails', async () => {
    const ctx = createMockContext();
    const error = new Error('boom');

    await expect(
      withStatusMessage(ctx as never, 'working...', async () => {
        throw error;
      }),
    ).rejects.toThrow('boom');

    expect(ctx.deleteMessage).toHaveBeenCalledWith(42);
  });
});
