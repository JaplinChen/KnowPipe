---
title: health
description: 即時健康快照：10 秒內完成 TS 編譯、行數、進程、Bot、Git、前置條件檢查
---

# /health — 即時健康快照

輕量版 `/weekly`，開發過程中隨時呼叫，不打斷工作流。

## 使用方式

```
/health              # 10 秒健康快照（7 項並行）
```

---

## 核心規則

- 全部唯讀，不修改任何檔案
- 所有檢查並行執行，10 秒內完成
- 單一表格輸出，一目了然
- 發現問題時指向具體修復 skill

---

## 執行流程（全部並行）

用 Bash 並行執行以下 7 項檢查：

**1. 前置條件（必要工具）**
```bash
echo "node: $(node --version 2>/dev/null || echo '❌ 未安裝')"
echo "tsx: $(npx tsx --version 2>/dev/null || echo '❌ 未安裝')"
echo "yt-dlp: $(yt-dlp --version 2>/dev/null || echo '⚠️ 未安裝')"
echo "omlx: $(command -v omlx >/dev/null 2>&1 && echo '✅' || echo '⚠️ 未安裝')"
echo "browser-use: $(command -v browser-use >/dev/null 2>&1 && echo '✅' || echo '⚠️ 未安裝')"
```

**2. TypeScript 編譯**
```bash
npx tsc --noEmit 2>&1 | tail -3
```

**3. 行數掃描**
```bash
find src -name '*.ts' -exec wc -l {} + 2>/dev/null | sort -rn | head -5
```
超過 300 行 → 標記警告

**4. 殭屍進程**
```bash
ps -eo pid,ppid,command | grep -E 'node|tsx' | grep -v grep
```

**5. Bot 狀態**
```bash
# 檢查 PID lockfile
[ -f .bot.pid ] && echo "PID: $(cat .bot.pid)" || echo "未運行"
# 檢查進程是否真的存活
[ -f .bot.pid ] && kill -0 "$(cat .bot.pid)" 2>/dev/null && echo "進程存活" || echo "進程已死或未運行"
```

**6. Telegram API 連通性**
```bash
BOT_TOKEN=$(grep BOT_TOKEN .env | cut -d'=' -f2)
curl -s --max-time 5 "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | grep -q '"ok":true' && echo "✅ API 連通" || echo "❌ API 不通"
```

**7. Git 狀態**
```bash
git status --short | wc -l
git log --oneline -1
```

---

## 輸出格式

```
健康快照

| 項目        | 狀態 | 詳情                |
|-------------|------|---------------------|
| 前置條件    | pass | node/tsx/yt-dlp OK  |
| TS 編譯     | pass | 零錯誤              |
| 行數合規    | warn | bot.ts:302          |
| 殭屍進程    | pass | 0 個殘留進程        |
| Bot 狀態    | ok   | PID 12345 存活      |
| Telegram    | pass | API 連通            |
| Git 狀態    | info | 3 uncommitted       |
```

---

## 與其他 Skill 的關係

| 發現問題 | 建議 |
|---------|------|
| 前置條件缺失 | `brew install <tool>` |
| TS 編譯失敗 | 手動修復 |
| 行數超標 | `/refactor --modularize` |
| 殭屍進程 | `/launch --stop` |
| Bot 未運行 | `/launch` |
| Telegram 不通 | 檢查 .env BOT_TOKEN 或網路 |
| 大量未提交 | `/ship` |
