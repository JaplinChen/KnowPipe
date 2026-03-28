/**
 * Creates a restricted PluginContext for a specific plugin.
 * Plugins only get fetch, AI completion, and logging — no filesystem or config access.
 */
import type { PluginContext } from './plugin-types.js';
import { omlxChatCompletion } from '../utils/omlx-client.js';
import { logger } from '../core/logger.js';

export function createPluginContext(pluginName: string): PluginContext {
  return {
    fetchWithTimeout: async (url, opts) => {
      const timeoutMs = opts?.timeoutMs ?? 15_000;
      const { timeoutMs: _, ...fetchOpts } = opts ?? {};
      return fetch(url, {
        ...fetchOpts,
        signal: AbortSignal.timeout(timeoutMs),
      });
    },

    aiComplete: (prompt, opts) => {
      return omlxChatCompletion(prompt, {
        model: 'standard',
        timeoutMs: opts?.timeoutMs ?? 30_000,
        maxTokens: opts?.maxTokens ?? 4096,
      });
    },

    log: {
      info: (msg, meta) => logger.info(`plugin:${pluginName}`, msg, meta),
      warn: (msg, meta) => logger.warn(`plugin:${pluginName}`, msg, meta),
      error: (msg, meta) => logger.error(`plugin:${pluginName}`, msg, meta),
    },
  };
}
