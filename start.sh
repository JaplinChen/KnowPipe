#!/bin/bash
# ObsBot 啟動腳本（macOS）
# 用法：雙擊執行或終端機執行 ./start.sh
#   --no-loop  單次執行，不自動重啟
#   --stop     停止所有 ObsBot 進程

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ 找不到 .env 檔案，請先執行："
  echo "   cp .env.example .env"
  echo "   然後填入 BOT_TOKEN 和 VAULT_PATH"
  read -p "按 Enter 關閉..."
  exit 1
fi

if [ "$1" = "--stop" ]; then
  echo "🛑 停止所有 ObsBot 進程..."
  pkill -f "node.*src/index" 2>/dev/null
  pkill -f "tsx.*src/index" 2>/dev/null
  sleep 1
  echo "✅ 已停止"
  exit 0
fi

# 先清除舊進程，避免 409 衝突
pkill -f "node.*src/index" 2>/dev/null
pkill -f "tsx.*src/index" 2>/dev/null
sleep 2

if [ "$1" = "--no-loop" ]; then
  echo "🚀 啟動 Bot（單次模式）..."
  npm run dev
else
  echo "🔄 啟動 Bot（自動重啟模式）..."
  echo "   關閉此視窗或按 Ctrl+C 停止"
  echo ""
  # caffeinate -i 防止 macOS 睡眠時終止進程
  caffeinate -i npm run dev:loop
fi
