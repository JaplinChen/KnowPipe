/**
 * OpenCLI client — wraps the opencli CLI tool for browser-based content extraction.
 * OpenCLI reuses Chrome's logged-in state via CDP, enabling access to login-walled
 * content on 20+ platforms (Bilibili, 小紅書, Twitter, 微信讀書, etc.).
 *
 * Requires: npm install -g @jackwener/opencli
 * See: https://github.com/jackwener/opencli
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Check if opencli is installed */
async function isOpenCliInstalled(): Promise<boolean> {
  try {
    await execFileAsync('which', ['opencli']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch rendered HTML from a URL using OpenCLI.
 * Leverages Chrome's logged-in session for login-walled content.
 * Returns HTML string or null if OpenCLI is unavailable.
 */
export async function fetchHtmlWithOpenCli(url: string): Promise<string | null> {
  if (!(await isOpenCliInstalled())) return null;

  try {
    const { stdout } = await execFileAsync('opencli', ['fetch', url, '--format', 'html'], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout && stdout.length > 100 ? stdout : null;
  } catch {
    return null;
  }
}

/**
 * Fetch Bilibili video subtitles using OpenCLI.
 * Requires Chrome to be logged into Bilibili.
 * @param bvid — Bilibili video ID (e.g. BV1L3411J7Yc)
 */
export async function fetchBilibiliSubtitle(bvid: string): Promise<string | null> {
  if (!(await isOpenCliInstalled())) return null;

  try {
    const { stdout } = await execFileAsync('opencli', ['bilibili', 'subtitle', '--bvid', bvid], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout && stdout.trim().length > 20 ? stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Fetch content from 小紅書 using OpenCLI.
 * Requires Chrome to be logged into Xiaohongshu.
 * @param noteId — Xiaohongshu note ID
 */
export async function fetchXiaohongshuNote(noteId: string): Promise<string | null> {
  if (!(await isOpenCliInstalled())) return null;

  try {
    const { stdout } = await execFileAsync('opencli', ['xiaohongshu', 'note', '--id', noteId], {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout && stdout.trim().length > 20 ? stdout.trim() : null;
  } catch {
    return null;
  }
}
