/**
 * pinchtab headless browser client.
 * Lightweight Go-based browser controller (~12MB, ~800 tokens/page).
 * Uses CLI commands: pinchtab nav <url> → pinchtab text/snap.
 * Requires pinchtab server running: pinchtab server
 *
 * Used as a fallback tier between Camoufox and BrowserUse CLI.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Check if pinchtab binary is installed */
async function isPinchtabInstalled(): Promise<boolean> {
  try {
    await execFileAsync('which', ['pinchtab']);
    return true;
  } catch {
    return false;
  }
}

/** Check if pinchtab server is running */
async function isPinchtabHealthy(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('pinchtab', ['health'], { timeout: 5_000 });
    return stdout.includes('ok') || stdout.includes('healthy') || stdout.includes('running');
  } catch {
    return false;
  }
}

/**
 * Fetch page text from a URL using pinchtab.
 * Navigates to URL, waits for render, then extracts text.
 * Returns extracted text or null if pinchtab is unavailable.
 */
export async function fetchHtmlWithPinchtab(url: string): Promise<string | null> {
  if (!(await isPinchtabInstalled())) return null;
  if (!(await isPinchtabHealthy())) return null;

  try {
    // Navigate to URL
    await execFileAsync('pinchtab', ['nav', url], { timeout: 30_000 });

    // Wait for content to render
    await execFileAsync('pinchtab', ['wait', '--network-idle', '--timeout', '5000'], {
      timeout: 10_000,
    }).catch(() => {});

    // Extract page text (--raw for full content)
    const { stdout } = await execFileAsync('pinchtab', ['text', '--raw'], {
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    return stdout && stdout.length > 100 ? stdout : null;
  } catch {
    return null;
  }
}
