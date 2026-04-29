---
title: launch
description: KnowPipe 管理：啟動（標準/強制/診斷）+ 停止，自動處理 409 衝突
---

# /launch — KnowPipe 管理

整合啟動（三模式）和停止的完整 Bot 管理工具。

## 使用方式

```
/launch              # 標準啟動（kill → tsc → start → 監控 15s）
/launch --force      # 強制啟動（殺所有 node → 等 5s → tsc → start → 409 重試）
/launch --diagnose   # 深度診斷（ps 分析 → 精確 kill → 網路連線 → 重啟）
/launch --stop       # 安全停止所有 Bot 進程
```

---

## 模式一：標準啟動（預設）

### Phase 1：環境檢查
```bash
node --version
yt-dlp --version 2>/dev/null || echo "yt-dlp 未安裝"
```

### Phase 2：清除殭屍進程
```bash
# 先殺 loop 父進程（否則子進程被殺後會自動重生）
if [ -f ".loop.pid" ]; then
  kill $(cat .loop.pid) 2>/dev/null && rm .loop.pid
fi
pkill -f "loop.mjs" 2>/dev/null

# 用 .bot.pid 精確 kill（bot 改名為 ObsBot 後 pkill -f pattern 失效）
if [ -f ".bot.pid" ]; then
  kill $(cat .bot.pid) 2>/dev/null && rm .bot.pid
fi
# 再用進程名補殺（process.title = 'ObsBot'）
pkill -x "ObsBot" 2>/dev/null
pkill -f "node.*src/index" 2>/dev/null

sleep 3
# 驗證乾淨
pgrep -x "ObsBot" >/dev/null 2>&1 && pkill -9 -x "ObsBot" 2>/dev/null || true
```

### Phase 3：TypeScript 編譯
```bash
npx tsc --noEmit
```
有錯誤 → **停止**。

### Phase 4：啟動 Bot
```bash
npm run dev
```

### Phase 5：監控前 15 秒
- `bot launched` → 成功
- `409 Conflict` → ProcessGuardian 自動重試

---

## 模式二：強制啟動（`--force`）

| | 標準 | --force |
|--|------|---------|
| Kill 策略 | bot 相關 | **全部 node 進程** |
| 等待 | 3 秒 | **5 秒** |
| 409 | Guardian 處理 | **10s 掃描，自動重試** |

額外清除 lockfile（.bot.pid、.Codex-bot.pid、bot.pid）。
第二次仍 409 → 報告需等 30 秒讓 Telegram 端超時。

---

## 模式三：深度診斷（`--diagnose`）

### Step 1：進程分析
```bash
ps aux | grep -E "node.*src/index|ObsBot" | grep -v grep
```
判斷進程用途：bot 相關（ObsBot process title 或 tsx src/index）→ kill | Codex/vscode → 保留

### Step 2：Lockfile + 網路連線
```bash
lsof -i -nP | grep -E "149\.154|91\.108"
```

### Step 3：精確 kill
只 kill bot 相關 PID。

### Step 4：若找不到進程
等待 30 秒讓 Telegram 伺服器端 polling timeout。

### Step 5：deleteWebhook 重置（極端情況）
```bash
BOT_TOKEN=$(grep BOT_TOKEN .env | cut -d'=' -f2)
curl "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"
```

### Step 6：確認乾淨後啟動

---

## 模式四：停止（`--stop`）

### Step 1：列出 node 進程
```bash
ps aux | grep "node.*src/index" | grep -v grep
```

### Step 2：停止
```bash
if [ -f ".loop.pid" ]; then kill $(cat .loop.pid) 2>/dev/null && rm .loop.pid; fi
pkill -f "loop.mjs" 2>/dev/null
# 用 .bot.pid 精確 kill（process.title 改名後 pattern 失效）
if [ -f ".bot.pid" ]; then kill $(cat .bot.pid) 2>/dev/null && rm .bot.pid; fi
pkill -x "ObsBot" 2>/dev/null
pkill -f "node.*src/index" 2>/dev/null
sleep 2
```

### Step 3：驗證已停止
若仍有進程 → 重試，最多 3 次。

### Step 4：清除 Lockfile
```bash
[ -f ".bot.lock" ] && rm .bot.lock
[ -f ".bot.pid" ] && rm .bot.pid
[ -f ".Codex-bot.pid" ] && rm .Codex-bot.pid
[ -f "bot.pid" ] && rm bot.pid
```

### 緊急模式
```bash
pkill -9 -x "ObsBot" 2>/dev/null
pkill -9 -f "node.*src/index" 2>/dev/null
pkill -9 -f "opencode run" 2>/dev/null
```

---

## 輸出格式

```
ObsBot Launch Report
模式：標準 / 強制 / 診斷 / 停止
環境      Node v20.x | yt-dlp OK
進程清除  0 個殭屍進程
TypeScript 零錯誤
Bot 啟動  Guardian active
```

## 自動升級

| 情況 | 自動升級到 |
|------|-----------|
| 標準模式 409 持續 | → `--force` |
| --force 仍 409 | → `--diagnose` |
