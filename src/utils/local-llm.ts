/**
 * LLM prompt runner with multi-model routing.
 * Priority: oMLX (local, if configured) → opencode CLI → DDG AI Chat (free).
 * Models: flash (mimo-v2) → standard (minimax-m2.5) → deep (nemotron-3).
 */
import { spawn } from 'node:child_process';
import { runViaDdgChat } from './ddg-chat.js';

const CLI_TIMEOUT_MS = 90_000;

/** oMLX local inference config from environment. */
const OMLX_BASE_URL = process.env.OMLX_BASE_URL || '';
const OMLX_MODEL = process.env.OMLX_MODEL || '';

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

/* ── oMLX provider (local OpenAI-compatible API) ──────────────────────── */

/** Run prompt via oMLX local inference server (OpenAI-compatible API). */
async function runViaOmlx(prompt: string, timeoutMs: number): Promise<string | null> {
  if (!OMLX_BASE_URL || !OMLX_MODEL) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${OMLX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OMLX_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Run a prompt against LLM providers.
 * Priority: oMLX (local) → opencode CLI → DDG AI Chat (free).
 * Returns null when no provider succeeds.
 */
export async function runLocalLlmPrompt(prompt: string, options: RunOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const tier = options.model ?? 'standard';
  const model = LLM_MODELS[tier];

  // 1) Try oMLX local inference (if configured)
  const omlxResult = await runViaOmlx(prompt, timeoutMs);
  if (omlxResult) return omlxResult;

  // 2) Try opencode CLI with selected model
  const cliResult = await runViaCli(prompt, timeoutMs, model);
  if (cliResult) return cliResult;

  // 3) Fallback to DuckDuckGo AI Chat via Camoufox (free, slower)
  const ddgResult = await runViaDdgChat(prompt, timeoutMs);
  if (ddgResult) return ddgResult;

  return null;
}
