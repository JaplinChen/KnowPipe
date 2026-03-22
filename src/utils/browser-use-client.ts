/**
 * Browser Use CLI client — wraps `browser-use` commands via execFileAsync.
 * Pattern matches existing yt-dlp / ffmpeg CLI integration style.
 * Each client instance uses a named session for isolation.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT = 30_000;
const MAX_BUFFER = 5 * 1024 * 1024;

/** Parsed element from `browser-use state` output */
export interface BrowserElement {
  index: number;
  tag: string;
  text: string;
}

export class BrowserUseClient {
  private readonly session: string;

  constructor(session = 'getthreads') {
    this.session = session;
  }

  /** Check if browser-use CLI is installed */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('browser-use', ['--version'], { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  /** Navigate to a URL and wait for the page to load */
  async open(url: string): Promise<string> {
    return this.exec(['open', url]);
  }

  /** Get visible text content of the current page */
  async text(): Promise<string> {
    return this.exec(['text']);
  }

  /** Get page HTML source */
  async html(): Promise<string> {
    return this.exec(['html'], 15_000);
  }

  /** Get interactive elements on the page (index + tag + text) */
  async state(): Promise<BrowserElement[]> {
    const raw = await this.exec(['state']);
    return this.parseState(raw);
  }

  /** Take a screenshot and save to file */
  async screenshot(outputPath: string): Promise<string> {
    return this.exec(['screenshot', outputPath]);
  }

  /** Click an element by its index from `state()` */
  async click(index: number): Promise<string> {
    return this.exec(['click', String(index)]);
  }

  /** Type text into the focused element or element by index */
  async type(index: number, value: string): Promise<string> {
    return this.exec(['type', String(index), value]);
  }

  /** Scroll the page */
  async scroll(direction: 'up' | 'down', amount = 3): Promise<string> {
    return this.exec(['scroll', direction, String(amount)]);
  }

  /** Get current page URL */
  async url(): Promise<string> {
    const raw = await this.exec(['url']);
    return raw.trim();
  }

  /** Execute arbitrary JavaScript in the page context */
  async evaluate(script: string): Promise<string> {
    return this.exec(['execute', script]);
  }

  /** Import cookies from a JSON file */
  async importCookies(filePath: string): Promise<string> {
    return this.exec(['cookies', 'import', filePath]);
  }

  /** Export cookies to a JSON file */
  async exportCookies(filePath: string): Promise<string> {
    return this.exec(['cookies', 'export', filePath]);
  }

  /** Close the browser session */
  async close(): Promise<void> {
    try {
      await this.exec(['close'], 5_000);
    } catch {
      // Ignore close errors — daemon may already be stopped
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private async exec(args: string[], timeout = DEFAULT_TIMEOUT): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'browser-use',
        ['--session', this.session, ...args],
        { timeout, maxBuffer: MAX_BUFFER },
      );
      return stdout;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT') || msg.includes('not found')) {
        throw new Error(
          'browser-use CLI 未安裝。請執行：curl -fsSL https://browser-use.com/cli/install.sh | bash',
        );
      }
      throw err;
    }
  }

  /** Parse `browser-use state` output into structured elements */
  private parseState(raw: string): BrowserElement[] {
    const elements: BrowserElement[] = [];
    // Format: "[index] <tag> text..."
    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^\[(\d+)]\s*<(\w+)>\s*(.*)/);
      if (m) {
        elements.push({
          index: parseInt(m[1], 10),
          tag: m[2],
          text: m[3].trim(),
        });
      }
    }
    return elements;
  }
}

/** Shared singleton — use `getthreads` session by default */
export const browserUseClient = new BrowserUseClient();
