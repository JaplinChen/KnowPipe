/**
 * oMLX HTTP client — lightweight wrapper around fetch() for local LLM inference.
 * No SDK dependency. Calls oMLX's OpenAI-compatible /v1/chat/completions endpoint.
 */
import { logger } from '../core/logger.js';

/* ── Configuration (from env) ─────────────────────────────────────── */

export interface OmlxConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  /** Model ID mapping per tier */
  models: {
    flash: string;
    standard: string;
    deep: string;
    vision: string;
  };
}

export function loadOmlxConfig(): OmlxConfig {
  const enabled = process.env.OMLX_ENABLED === 'true';
  return {
    enabled,
    baseUrl: process.env.OMLX_BASE_URL ?? 'http://localhost:8000/v1',
    apiKey: process.env.OMLX_API_KEY ?? '',
    models: {
      flash: process.env.OMLX_MODEL_FLASH ?? 'MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-4bit',
      standard: process.env.OMLX_MODEL_STANDARD ?? 'Qwen3.5-9B-MLX-4bit',
      deep: process.env.OMLX_MODEL_DEEP ?? 'Qwen3.5-27B-4bit',
      vision: process.env.OMLX_MODEL_VISION ?? 'Qwen2.5-VL-7B-Instruct-4bit',
    },
  };
}

/** Lazily cached config — reloaded on first use. */
let cachedConfig: OmlxConfig | null = null;

export function getOmlxConfig(): OmlxConfig {
  if (!cachedConfig) cachedConfig = loadOmlxConfig();
  return cachedConfig;
}

/* ── Chat completion (text) ───────────────────────────────────────── */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
}

/**
 * Send a chat completion request to oMLX.
 * Returns the assistant message content, or null on failure.
 */
export async function omlxChatCompletion(
  messages: ChatMessage[],
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const config = getOmlxConfig();
  if (!config.enabled) return null;

  const url = `${config.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        // Disable Qwen3.5 thinking mode for direct structured output
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn('omlx', 'request failed', { status: res.status, statusText: res.statusText });
      return null;
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError is expected on timeout — log at debug level
    if (msg.includes('abort')) {
      logger.warn('omlx', 'timeout', { timeoutMs });
    } else {
      logger.warn('omlx', 'error', { message: msg });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Convenience: prompt-in, text-out ─────────────────────────────── */

/**
 * Run a simple text prompt via oMLX.
 * Wraps the prompt as a single user message.
 */
export async function omlxTextPrompt(
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  return omlxChatCompletion(
    [{ role: 'user', content: prompt }],
    model,
    timeoutMs,
  );
}

/* ── Vision: image analysis ───────────────────────────────────────── */

/**
 * Analyze an image via oMLX VLM.
 * Accepts either a base64 data URL or a regular image URL.
 */
export async function omlxVisionPrompt(
  imageUrl: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> {
  const config = getOmlxConfig();
  const model = config.models.vision;

  return omlxChatCompletion(
    [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    model,
    timeoutMs,
  );
}

/* ── Health check ─────────────────────────────────────────────────── */

/**
 * Quick health check — returns true if oMLX is reachable and has models.
 */
export async function isOmlxAvailable(): Promise<boolean> {
  const config = getOmlxConfig();
  if (!config.enabled) return false;

  try {
    const res = await fetch(`${config.baseUrl}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
