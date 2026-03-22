#!/bin/bash
# GetThreads Bot 啟動腳本（macOS）
# 用法：./start.sh [--loop] [--force]

cd "$(dirname "$0")"

# === 前置檢查 ===
if [ ! -f .env ]; then
  echo "❌ 找不到 .env 檔案，請先執行："
  echo "   cp .env.example .env"
  echo "   然後填入 BOT_TOKEN 和 VAULT_PATH"
  exit 1
fi

# === 前置清理：自動 kill 殘留 Bot 進程 ===
STALE_PIDS=$(pgrep -f 'src/index.ts|dist/index.js' 2>/dev/null)
if [ -n "$STALE_PIDS" ]; then
  echo "🧹 偵測到殘留 Bot 進程，自動清理..."
  echo "$STALE_PIDS" | xargs kill -TERM 2>/dev/null
  sleep 2
  # SIGKILL survivors
  for pid in $STALE_PIDS; do
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
  done
  echo "✅ 殘留進程已清除"
  # 清除 lockfiles
  rm -f .bot.pid .bot.lock bot.pid
fi

# === 前置條件檢查 ===
echo "🔍 環境檢查..."
MISSING=""
command -v node >/dev/null 2>&1 || MISSING="$MISSING node"
command -v npx >/dev/null 2>&1 || MISSING="$MISSING npx"

if [ -n "$MISSING" ]; then
  echo "❌ 缺少必要工具：$MISSING"
  exit 1
fi

echo "   Node $(node --version)"
command -v yt-dlp >/dev/null 2>&1 && echo "   yt-dlp $(yt-dlp --version)" || echo "   ⚠️  yt-dlp 未安裝（影片功能不可用）"

# === 啟動 ===
if [ "$1" = "--loop" ]; then
  echo "🔄 啟動 Bot（自動重啟模式）..."
  npm run dev:loop
elif [ "$1" = "--force" ]; then
  echo "🚀 啟動 Bot（強制模式）..."
  npm run dev -- --force
else
  echo "🚀 啟動 Bot..."
  npm run dev
fi
