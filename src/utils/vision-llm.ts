/**
 * Vision-capable LLM runner.
 * Priority: oMLX VLM (local, base64) → OpenCode CLI (gpt-5-nano, file path).
 * Downloads images to temp dir when needed, cleans up afterwards.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from '../core/logger.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';
import { cleanOpenCodeOutput } from './local-llm.js';
import { omlxVisionPrompt, getOmlxConfig } from './omlx-client.js';

const VISION_MODEL = 'opencode/gpt-5-nano';
const VISION_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const VISION_PROMPT = `Describe this image in Traditional Chinese (zh-TW) in 2-3 sentences.
Focus on: what tool/product/concept is shown, key visual elements, any text visible in the image.
Be factual and concise. Do not describe decorative elements.`;

/* ── oMLX VLM (local, base64) ─────────────────────────────────────── */

/** Convert a local file to a base64 data URL. */
async function fileToDataUrl(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const ext = filePath.match(/\.(jpe?g|png|gif|webp)/i)?.[1]?.toLowerCase() ?? 'jpeg';
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Analyze via oMLX VLM — returns null if oMLX is disabled or fails. */
async function analyzeViaOmlx(
  imagePath: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> {
  const config = getOmlxConfig();
  if (!config.enabled) return null;

  try {
    const dataUrl = await fileToDataUrl(imagePath);
    const result = await omlxVisionPrompt(dataUrl, prompt, timeoutMs);
    if (result) {
      logger.info('vision', 'omlx-vlm-ok', { chars: result.length });
    }
    return result;
  } catch {
    return null;
  }
}

/* ── OpenCode CLI VLM (remote) ────────────────────────────────────── */

/** Analyze a single local image via opencode gpt-5-nano vision. */
async function analyzeViaCli(
  imagePath: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'opencode',
      ['run', '-m', VISION_MODEL, '-f', imagePath],
      { timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const cleaned = cleanOpenCodeOutput(stdout);
      resolve(cleaned || null);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/* ── Public API ───────────────────────────────────────────────────── */

/** Analyze a single local image. oMLX VLM → OpenCode CLI fallback. */
export async function analyzeImage(
  imagePath: string,
  prompt = VISION_PROMPT,
  timeoutMs = VISION_TIMEOUT_MS,
): Promise<string | null> {
  // 1) Try oMLX VLM (local, fast)
  const omlxResult = await analyzeViaOmlx(imagePath, prompt, timeoutMs);
  if (omlxResult) return omlxResult;

  // 2) Fallback to OpenCode CLI
  return analyzeViaCli(imagePath, prompt, timeoutMs);
}

/**
 * Download images to temp dir, analyze up to maxCount with vision model,
 * return combined descriptions. Cleans up temp files afterwards.
 */
export async function analyzeContentImages(
  imageUrls: string[],
  maxCount = 2,
): Promise<string> {
  const id = randomBytes(4).toString('hex');
  const tempDir = join(tmpdir(), `getthreads-vision-${id}`);
  await mkdir(tempDir, { recursive: true });

  const descriptions: string[] = [];
  try {
    const urls = imageUrls.slice(0, maxCount);
    for (let i = 0; i < urls.length; i++) {
      try {
        // Download to temp
        const res = await fetchWithTimeout(urls[i], 15_000);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) continue;
        const ext = urls[i].match(/\.(jpe?g|png|gif|webp)/i)?.[0] ?? '.jpg';
        const imgPath = join(tempDir, `img-${i}${ext}`);
        await writeFile(imgPath, buf);

        // Analyze
        const desc = await analyzeImage(imgPath);
        if (desc) {
          descriptions.push(`[圖片${i + 1}] ${desc}`);
          logger.info('vision', `image ${i + 1} analyzed`, { chars: desc.length });
        }
      } catch (err) {
        logger.warn('vision', `image ${i + 1} failed`, { message: (err as Error).message });
      }
    }
  } finally {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return descriptions.join('\n');
}
