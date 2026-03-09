import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { runViaDdgChat } from './ddg-chat.js';

const execFileAsync = promisify(execFile);

export type LocalLlmProvider = 'claude' | 'codex' | 'opencode';

interface RunOptions {
  timeoutMs?: number;
}

/* ── Claude API provider ─────────────────────────────────────────────── */

let _client: Anthropic | null = null;

function getApiClient(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

async function runViaApi(prompt: string, timeoutMs: number): Promise<string | null> {
  const client = getApiClient();
  if (!client) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }, { signal: controller.signal });

    const block = res.content[0];
    return block.type === 'text' ? block.text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Local CLI provider ──────────────────────────────────────────────── */

function providerArgs(provider: LocalLlmProvider, prompt: string): { cmd: string; args: string[] } {
  switch (provider) {
    case 'claude':
      return { cmd: 'claude', args: ['-p', prompt] };
    case 'codex':
      return { cmd: 'codex', args: ['-p', prompt] };
    case 'opencode':
      return { cmd: 'opencode', args: ['-p', prompt] };
    default:
      return { cmd: 'claude', args: ['-p', prompt] };
  }
}

function configuredProviders(): LocalLlmProvider[] {
  const raw = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'claude' || raw === 'codex' || raw === 'opencode') {
    return [raw];
  }
  return ['claude', 'codex', 'opencode'];
}

function isRecoverableCliError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('ENOENT') ||
    msg.includes('not recognized') ||
    msg.includes('Unknown option') ||
    msg.includes('unknown option') ||
    msg.includes('Usage:')
  );
}

/**
 * Run a prompt against LLM providers.
 * Priority: Claude API → DDG AI Chat (Camoufox) → local CLI tools.
 * Returns null when no provider succeeds.
 */
export async function runLocalLlmPrompt(prompt: string, options: RunOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  // 1) Try Claude API first (fastest, needs ANTHROPIC_API_KEY + credits)
  const apiResult = await runViaApi(prompt, timeoutMs);
  if (apiResult) return apiResult;

  // 2) Try DuckDuckGo AI Chat via Camoufox (free, no login)
  const ddgResult = await runViaDdgChat(prompt, timeoutMs);
  if (ddgResult) return ddgResult;

  // 3) Fallback to local CLI providers
  const providers = configuredProviders();
  for (const provider of providers) {
    const { cmd, args } = providerArgs(provider, prompt);
    try {
      // 清除 CLAUDECODE 環境變數，避免嵌套限制阻擋 claude -p
      const env = { ...process.env };
      delete env.CLAUDECODE;
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env,
      });
      const out = stdout.trim();
      if (out) return out;
    } catch (err) {
      if (isRecoverableCliError(err)) {
        continue;
      }
    }
  }

  return null;
}
