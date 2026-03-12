/**
 * LLM prompt runner with multi-model routing.
 * Models: flash (mimo-v2) → standard (minimax-m2.5) → deep (nemotron-3).
 * Fallback: DDG AI Chat (Camoufox, free).
 */
import { spawn } from 'node:child_process';
import { runViaDdgChat } from './ddg-chat.js';

const CLI_TIMEOUT_MS = 90_000;

/** Available free models ranked by capability. */
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

/* ── CLI provider (OpenCode + multi-model routing) ───────────────────── */

/** Strip ANSI escape codes and opencode banner lines from output. */
export function cleanOpenCodeOutput(raw: string): string {
  const noAnsi = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = noAnsi.split('\n').filter(
    (line) => !line.startsWith('> ') && line.trim().length > 0,
  );
  return lines.join('\n').trim();
}

/**
 * Run prompt via OpenCode CLI using stdin pipe.
 * Windows .cmd files cannot be executed via execFile (EINVAL),
 * so we spawn cmd.exe /c and pipe the prompt via stdin.
 */
async function runViaCli(prompt: string, timeoutMs: number, model: string): Promise<string | null> {
  const timeout = Math.min(timeoutMs, CLI_TIMEOUT_MS);

  return new Promise((resolve) => {
    const proc = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'opencode',
      process.platform === 'win32'
        ? ['/c', 'opencode', 'run', '-m', model]
        : ['run', '-m', model],
      { timeout, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
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

/**
 * Run a prompt against LLM providers.
 * Priority: opencode run (selected model) → DDG AI Chat (Camoufox, free).
 * Returns null when no provider succeeds.
 */
export async function runLocalLlmPrompt(prompt: string, options: RunOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const tier = options.model ?? 'standard';
  const model = LLM_MODELS[tier];

  // 1) Try opencode CLI with selected model
  const cliResult = await runViaCli(prompt, timeoutMs, model);
  if (cliResult) return cliResult;

  // 2) Fallback to DuckDuckGo AI Chat via Camoufox (free, slower)
  const ddgResult = await runViaDdgChat(prompt, timeoutMs);
  if (ddgResult) return ddgResult;

  return null;
}
