/**
 * LLM prompt runner with multi-provider routing.
 * Priority: oMLX (local) → OpenCode CLI (remote) → DDG AI Chat (fallback).
 * Models: flash → standard → deep per tier.
 */
import { spawn } from 'node:child_process';
import { runViaDdgChat } from './ddg-chat.js';
import { omlxTextPrompt, getOmlxConfig } from './omlx-client.js';
import { logger } from '../core/logger.js';

const CLI_TIMEOUT_MS = 90_000;

/** Available free models ranked by capability (OpenCode CLI). */
export const LLM_MODELS = {
  flash: 'opencode/mimo-v2-flash-free',       // fast, keyword/title extraction
  standard: 'opencode/minimax-m2.5-free',      // balanced, general enrichment
  deep: 'opencode/nemotron-3-super-free',      // thorough, long-form analysis
} as const;

export type ModelTier = keyof typeof LLM_MODELS;

interface RunOptions {
  timeoutMs?: number;
  /** Model tier for routing. Default: 'standard'. */
  model?: ModelTier;
}

/* ── oMLX provider (local, fastest) ───────────────────────────────── */

/** Run prompt via oMLX local inference server. */
async function runViaOmlx(prompt: string, timeoutMs: number, tier: ModelTier): Promise<string | null> {
  const config = getOmlxConfig();
  if (!config.enabled) return null;

  const model = config.models[tier];
  const result = await omlxTextPrompt(prompt, model, timeoutMs);
  if (result) {
    logger.info('llm', 'omlx-ok', { tier, chars: result.length });
  }
  return result;
}

/* ── CLI provider (OpenCode + multi-model routing) ───────────────── */

/** Strip ANSI escape codes and opencode banner lines from output. */
export function cleanOpenCodeOutput(raw: string): string {
  const noAnsi = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = noAnsi.split('\n').filter(
    (line) => !line.startsWith('> ') && line.trim().length > 0,
  );
  return lines.join('\n').trim();
}

/** Run prompt via OpenCode CLI using stdin pipe. */
async function runViaCli(prompt: string, timeoutMs: number, model: string): Promise<string | null> {
  const timeout = Math.min(timeoutMs, CLI_TIMEOUT_MS);

  return new Promise((resolve) => {
    const proc = spawn(
      'opencode',
      ['run', '-m', model],
      { timeout, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const out = cleanOpenCodeOutput(stdout);
      resolve(out || null);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/* ── Main entry point ─────────────────────────────────────────────── */

/**
 * Run a prompt against LLM providers.
 * Priority: oMLX (local) → opencode CLI → DDG AI Chat (Camoufox, free).
 * Returns null when no provider succeeds.
 */
export async function runLocalLlmPrompt(prompt: string, options: RunOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const tier = options.model ?? 'standard';

  // 1) Try oMLX local inference (fastest, no network)
  const omlxResult = await runViaOmlx(prompt, timeoutMs, tier);
  if (omlxResult) return omlxResult;

  // 2) Try opencode CLI with selected model
  const model = LLM_MODELS[tier];
  const cliResult = await runViaCli(prompt, timeoutMs, model);
  if (cliResult) return cliResult;

  // 3) Fallback to DuckDuckGo AI Chat via Camoufox (free, slower)
  const ddgResult = await runViaDdgChat(prompt, timeoutMs);
  if (ddgResult) return ddgResult;

  return null;
}
