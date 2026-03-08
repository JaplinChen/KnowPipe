import { Telegraf } from 'telegraf';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';

const PID_FILE = '.bot.pid';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000;

export class ProcessGuardian {
  private retries = 0;

  constructor(private bot: Telegraf) {}

  private writePid(): void {
    writeFileSync(PID_FILE, String(process.pid));
  }

  private clearPid(): void {
    try {
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  private clearStalePidIfDead(): void {
    if (!existsSync(PID_FILE)) return;

    try {
      const pidText = readFileSync(PID_FILE, 'utf8').trim();
      if (!/^\d+$/.test(pidText)) {
        console.warn('[Guardian] Invalid PID format in lockfile, clearing');
        this.clearPid();
        return;
      }

      const pid = Number(pidText);
      if (pid === process.pid) return;

      if (!this.isProcessAlive(pid)) {
        console.log(`[Guardian] Removing stale lockfile PID=${pid}`);
        this.clearPid();
        return;
      }

      console.warn(`[Guardian] Existing process detected PID=${pid}; not force-killing`);
    } catch {
      this.clearPid();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private is409(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('409') || msg.includes('Conflict');
  }

  private attempt(): void {
    this.bot.launch({ dropPendingUpdates: true }).catch(async (err: unknown) => {
      if (this.is409(err) && this.retries < MAX_RETRIES) {
        this.retries++;
        const delay = Math.min(BASE_DELAY_MS * 2 ** this.retries, 60_000);
        console.error(`[Guardian] 409 Conflict - retry ${this.retries}/${MAX_RETRIES} in ${delay / 1000}s`);
        await this.sleep(delay);
        this.attempt();
      } else if (this.retries >= MAX_RETRIES) {
        console.error('[Guardian] Max retries exceeded. Run /stopbot then /startbot.');
        this.clearPid();
        process.exit(1);
      } else {
        console.error('[Guardian] Fatal error:', err);
        this.clearPid();
        process.exit(1);
      }
    });
  }

  launch(): void {
    this.clearStalePidIfDead();
    this.writePid();

    process.once('SIGINT', () => {
      this.clearPid();
      this.bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      this.clearPid();
      this.bot.stop('SIGTERM');
    });

    this.attempt();
    console.log('[Guardian] Bot launching... (auto-retry on 409, max 5x)');
  }
}
