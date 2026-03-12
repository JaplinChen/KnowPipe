/**
 * Vision-capable LLM runner using OpenCode + gpt-5-nano.
 * Downloads images to temp dir, analyzes with vision model, cleans up.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from '../core/logger.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';
import { cleanOpenCodeOutput } from './local-llm.js';

const VISION_MODEL = 'opencode/gpt-5-nano';
const VISION_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const VISION_PROMPT = `Describe this image in Traditional Chinese (zh-TW) in 2-3 sentences.
Focus on: what tool/product/concept is shown, key visual elements, any text visible in the image.
Be factual and concise. Do not describe decorative elements.`;

/** Analyze a single local image via opencode gpt-5-nano vision. */
export async function analyzeImage(
  imagePath: string,
  prompt = VISION_PROMPT,
  timeoutMs = VISION_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise((resolve) => {
    const args =
      process.platform === 'win32'
        ? ['/c', 'opencode', 'run', '-m', VISION_MODEL, '-f', imagePath]
        : ['run', '-m', VISION_MODEL, '-f', imagePath];
    const proc = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'opencode',
      args,
      { timeout: timeoutMs, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
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
