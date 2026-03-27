#!/usr/bin/env node
/**
 * Cross-platform auto-restart loop for ObsBot.
 * Restarts the bot on exit (code 0 = restart, code 1 = crash recovery).
 * Usage: node scripts/loop.mjs [--dev]
 *
 * Inspired by Leo's Claude Code Channels while-loop pattern.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');
const RESTART_DELAY_MS = 3_000;
const CRASH_DELAY_MS = 10_000;

let running = true;

process.on('SIGINT', () => {
  running = false;
  console.log('\n[loop] 收到 SIGINT，停止重啟');
});

process.on('SIGTERM', () => {
  running = false;
  console.log('[loop] 收到 SIGTERM，停止重啟');
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toLocaleTimeString('zh-TW', { hour12: false });
}

async function run() {
  let consecutiveCrashes = 0;

  while (running) {
    console.log(`[loop] ${timestamp()} 啟動 Bot${isDev ? ' (dev mode)' : ''}…`);

    const args = isDev
      ? ['tsx', 'src/index.ts', '--force']
      : ['node', 'dist/index.js', '--force'];

    const child = spawn('npx', args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, LOOP_WRAPPER: '1' },
    });

    const code = await new Promise((resolve) => {
      child.on('exit', (c) => resolve(c ?? 1));
      child.on('error', () => resolve(1));
    });

    if (!running) break;

    if (code === 0) {
      // Graceful exit (e.g. /restart command)
      consecutiveCrashes = 0;
      console.log(`[loop] ${timestamp()} Bot 正常退出，${RESTART_DELAY_MS / 1000}s 後重啟…`);
      await sleep(RESTART_DELAY_MS);
    } else {
      // Crash
      consecutiveCrashes++;
      const delay = Math.min(CRASH_DELAY_MS * consecutiveCrashes, 60_000);
      console.log(`[loop] ${timestamp()} Bot 異常退出 (code=${code})，${delay / 1000}s 後重啟… (連續第 ${consecutiveCrashes} 次)`);
      await sleep(delay);
    }
  }

  console.log(`[loop] ${timestamp()} 結束`);
}

run();
