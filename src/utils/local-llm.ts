/**
 * LLM prompt runner.
 * Priority: opencode run (MiniMax M2.5 Free) → DDG AI Chat fallback.
 */
import { spawn } from 'node:child_process';
import { runViaDdgChat } from './ddg-chat.js';

const CLI_TIMEOUT_MS = 90_000;
const OPENCODE_MODEL = 'opencode/minimax-m2.5-free';

interface RunOptions {
  timeoutMs?: number;
}

/* ── CLI provider (OpenCode + MiniMax M2.5 Free) ─────────────────────── */

/** Strip ANSI escape codes and opencode banner lines from output. */
function cleanOpenCodeOutput(raw: string): string {
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
async function runViaCli(prompt: string, timeoutMs: number): Promise<string | null> {
  const timeout = Math.min(timeoutMs, CLI_TIMEOUT_MS);

  return new Promise((resolve) => {
    const proc = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'opencode',
      process.platform === 'win32'
        ? ['/c', 'opencode', 'run', '-m', OPENCODE_MODEL]
        : ['run', '-m', OPENCODE_MODEL],
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
 * Priority: opencode run (MiniMax M2.5 Free) → DDG AI Chat (Camoufox, free).
 * Returns null when no provider succeeds.
 */
export async function runLocalLlmPrompt(prompt: string, options: RunOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  // 1) Try opencode CLI with MiniMax M2.5 Free (~10-15s)
  const cliResult = await runViaCli(prompt, timeoutMs);
  if (cliResult) return cliResult;

  // 2) Fallback to DuckDuckGo AI Chat via Camoufox (free, slower)
  const ddgResult = await runViaDdgChat(prompt, timeoutMs);
  if (ddgResult) return ddgResult;

  return null;
}
