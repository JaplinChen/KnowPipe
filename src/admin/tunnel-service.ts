/**
 * Cloudflare Quick Tunnel 管理
 *
 * 啟動 `cloudflared tunnel --url http://localhost:<PORT>`，
 * 從 stdout/stderr 解析 trycloudflare.com URL，
 * 透過 onUrl callback 回傳給呼叫端（用於 Telegram 通知）。
 *
 * 設計：
 * - cloudflared 不存在時優雅降級（僅 warn，不 crash）
 * - bot 進程退出時自動 kill cloudflared 子進程
 * - Quick Tunnel URL 每次重啟都不同，透過 Telegram 通知使用者
 */

import { spawn, spawnSync } from 'node:child_process';

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const READY_TIMEOUT_MS = 30_000;

export interface TunnelOptions {
  port: number;
  onUrl: (url: string) => void;
  onError?: (msg: string) => void;
}

export function startQuickTunnel(opts: TunnelOptions): () => void {
  const { port, onUrl, onError } = opts;

  // 確認 cloudflared 是否存在（跨平台：Windows 用 where，其他用 which）
  const findCmd = process.platform === 'win32' ? 'where' : 'which';
  const whichResult = spawnSync(findCmd, ['cloudflared'], { encoding: 'utf-8' });
  const bin = whichResult.stdout.trim().split('\n')[0].trim();
  if (!bin) {
    const installHint = process.platform === 'win32'
      ? 'winget install Cloudflare.cloudflared'
      : process.platform === 'darwin'
        ? 'brew install cloudflared'
        : 'apt install cloudflared';
    onError?.(`cloudflared 未安裝，跳過 Quick Tunnel（${installHint}）`);
    return () => {};
  }

  const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let urlFound = false;
  let timeoutId: NodeJS.Timeout | undefined;

  function handleChunk(chunk: Buffer): void {
    const text = chunk.toString('utf-8');
    if (urlFound) return;
    const match = TUNNEL_URL_RE.exec(text);
    if (match) {
      urlFound = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      onUrl(match[0]);
    }
  }

  child.stdout?.on('data', handleChunk);
  child.stderr?.on('data', handleChunk);

  child.on('error', (err) => {
    onError?.(`cloudflared 啟動失敗：${err.message}`);
  });

  child.on('exit', (code, signal) => {
    if (urlFound) return; // 正常完成後退出不需警告
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      onError?.(`cloudflared 意外退出（code=${code ?? signal}）`);
    }
  });

  // 超時未拿到 URL 時提示
  timeoutId = setTimeout(() => {
    if (!urlFound) {
      onError?.(`cloudflared 啟動超時（${READY_TIMEOUT_MS / 1000}s），未取得 Tunnel URL`);
    }
  }, READY_TIMEOUT_MS);

  // bot 進程退出時清理子進程
  const cleanup = (): void => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (!child.killed) child.kill('SIGTERM');
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return cleanup;
}
