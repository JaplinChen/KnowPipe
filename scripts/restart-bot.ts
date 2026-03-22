/**
 * One-command bot restart: kill → wait → compile → start --force
 * Usage: npx tsx scripts/restart-bot.ts [--skip-wait]
 * Platform: macOS (Apple Silicon)
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

const WAIT_SECONDS = 8;
const skipWait = process.argv.includes('--skip-wait');

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function findBotProcesses(): number[] {
  try {
    const raw = execSync('ps -eo pid,command', { encoding: 'utf-8', timeout: 5_000 });
    const pids: number[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Match tsx/node processes running our bot
      if (trimmed.includes('src/index.ts') || trimmed.includes('dist/index.js')) {
        const pid = Number(trimmed.split(/\s+/)[0]);
        if (pid && pid !== process.pid) pids.push(pid);
      }
    }
    return pids;
  } catch {
    return [];
  }
}

function killProcesses(pids: number[]): number {
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      killed++;
    } catch {
      // Process may already be dead
    }
  }
  // Give SIGTERM a moment, then SIGKILL survivors
  if (killed > 0) {
    try { execSync('sleep 1'); } catch { /* ignore */ }
    for (const pid of pids) {
      try {
        process.kill(pid, 0); // Check if alive
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }
  }
  return killed;
}

function cleanOrphanNodeProcesses(): number {
  try {
    const raw = execSync('ps -eo pid,ppid,comm', { encoding: 'utf-8', timeout: 5_000 });
    let killed = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('PID')) continue;
      const [pidStr, ppidStr, comm] = trimmed.split(/\s+/, 3);
      if (!comm || !comm.includes('node')) continue;
      const pid = Number(pidStr);
      const parentPid = Number(ppidStr);
      if (!pid || pid === process.pid) continue;

      // Check if parent is dead → orphan
      try {
        process.kill(parentPid, 0);
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
          killed++;
        } catch { /* ignore */ }
      }
    }
    return killed;
  } catch {
    return 0;
  }
}

function cleanLockfiles(): void {
  const files = ['.bot.pid', '.bot.lock', 'bot.pid'];
  for (const f of files) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function compileCheck(): boolean {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    return true;
  } catch (err) {
    const output = (err as { stdout?: Buffer }).stdout?.toString() ?? '';
    console.error(output);
    return false;
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = seconds;
    const interval = setInterval(() => {
      process.stdout.write(`\r⏳ 等待 Telegram 連線釋放... ${remaining}s `);
      remaining--;
      if (remaining < 0) {
        clearInterval(interval);
        process.stdout.write('\r✅ 等待完成                           \n');
        resolve();
      }
    }, 1000);
  });
}

async function main(): Promise<void> {
  log('🔄 GetThreads 重啟開始');

  // Step 0: Clean orphan processes
  const orphans = cleanOrphanNodeProcesses();
  if (orphans > 0) log(`🧹 清除 ${orphans} 個殭屍 node 進程`);

  // Step 1: Find and kill bot processes (targeted, not all node)
  const botPids = findBotProcesses();
  const killed = killProcesses(botPids);
  cleanLockfiles();
  log(`🗑️  清除 ${killed} 個 bot 進程 + lockfiles`);

  // Step 2: Wait for Telegram to release polling connection
  if (killed > 0 && !skipWait) {
    await sleep(WAIT_SECONDS);
  } else {
    log('⏭️  無需等待（無舊進程）');
  }

  // Step 3: Compile check
  log('🔨 TypeScript 編譯檢查...');
  if (!compileCheck()) {
    log('❌ 編譯失敗，中止重啟');
    process.exit(1);
  }
  log('✅ 編譯通過');

  // Step 4: Start bot with --force
  log('🚀 啟動 Bot (--force)...');
  const child = spawn('npx', ['tsx', 'src/index.ts', '--force'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      log(`❌ Bot 異常退出 (code: ${code})`);
    }
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error('重啟失敗:', err);
  process.exit(1);
});
