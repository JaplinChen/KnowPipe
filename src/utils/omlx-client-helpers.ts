import type { ModelTier } from './local-llm.js';

interface OmlxMessage {
  role: string;
  content: string;
}

export function buildAuthHeaders(apiKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

export function buildOmlxMessages(prompt: string, systemPrompt?: string): OmlxMessage[] {
  const messages: OmlxMessage[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

export function buildChatCompletionBody(
  modelId: string,
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    stream?: boolean;
  } = {},
): string {
  const isQwenModel = modelId.toLowerCase().includes('qwen');

  return JSON.stringify({
    model: modelId,
    messages: buildOmlxMessages(prompt, options.systemPrompt),
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.stream ? { stream: true } : {}),
    ...(isQwenModel ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  });
}

export function buildVisionCompletionBody(
  modelId: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): string {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  return JSON.stringify({
    model: modelId,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
    temperature: 0.3,
    max_tokens: 1024,
  });
}

export async function parseOmlxContent(res: Response, label: string): Promise<string | null> {
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (content) {
    console.log(`[${label}] ✓ (${content.length} chars)`);
  }
  return content || null;
}

export function getOmlxTimeouts(): Record<ModelTier, number> {
  return {
    flash: 15_000,
    standard: 30_000,
    deep: 120_000,
  };
}
