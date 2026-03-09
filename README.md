# GetThreads

Telegram Bot — 貼上社群連結，自動擷取內容、AI 摘要、存成 Obsidian 筆記。

## 功能特色

- **11 個平台**自動擷取（X、Threads、TikTok、YouTube、GitHub 等）
- **AI 智慧摘要**：關鍵字、重點摘要、內容分析、條列整理（過濾廢話與廣告語）
- **自動分類**：規則式分類器，自動歸入 Obsidian 子資料夾
- **圖片/影片下載**：自動下載附件到 Vault
- **評論擷取**：X、Threads、Reddit、Bilibili 支援留言抓取
- **影片逐字稿**：YouTube 字幕 + TikTok whisper.cpp STT
- **簡轉繁**：自動偵測簡體中文並轉換為繁體

## 快速開始

### 前置需求

- Node.js >= 20
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)（YouTube / TikTok 影片擷取）
- [ffmpeg](https://ffmpeg.org/)（影片轉碼）
- [Camoufox](https://camoufox.com/)（Threads / 微博等需瀏覽器的平台）

```bash
# 1. 安裝依賴
npm install

# 2. 首次使用 Camoufox，需下載瀏覽器
npx camoufox-js fetch

# 3. 複製環境變數
cp .env.example .env
```

### 環境變數

| 變數 | 必填 | 說明 |
|------|:----:|------|
| `BOT_TOKEN` | ✅ | Telegram Bot Token（從 @BotFather 取得）|
| `VAULT_PATH` | ✅ | Obsidian Vault 絕對路徑 |
| `ALLOWED_USER_IDS` | — | 允許使用的 Telegram 用戶 ID（逗號分隔）|
| `ENABLE_TRANSLATION` | — | 啟用簡轉繁翻譯（`true`/`false`）|
| `MAX_LINKED_URLS` | — | 單則貼文最多抓取的外部連結數（預設 5）|
| `LLM_PROVIDER` | — | LLM CLI 偏好（`claude`/`codex`/`opencode`）|

### 啟動

```bash
npm run dev
```

## 支援平台

| 平台 | 擷取 | 評論 | 逐字稿 | 技術方案 |
|------|:----:|:----:|:------:|----------|
| X / Twitter | ✅ | ✅ | — | fxTweet API |
| Threads | ✅ | ✅ | — | Camoufox（無需登入）|
| Reddit | ✅ | ✅ | — | 公開 API（遞迴留言樹）|
| Bilibili | ✅ | ✅ | — | 公開 API |
| YouTube | ✅ | — | ✅ | yt-dlp + 自動字幕擷取 |
| TikTok | ✅ | — | ✅ | yt-dlp + whisper.cpp STT |
| GitHub | ✅ | — | — | REST API（含 README）|
| 微博 | ✅ | — | — | Camoufox |
| 小紅書 | ✅ | — | — | Camoufox（需登入）|
| 抖音 | ✅ | — | — | Camoufox（需登入）|
| 一般網頁 | ✅ | — | — | Jina Reader fallback |

## 處理管線

```
URL → Extractor（平台擷取 + 逐字稿）
   → Classifier（規則式自動分類）
   → AI Enricher（DDG AI Chat / CLI LLM）
   → Formatter（品質守門 + fallback）
   → Saver（Obsidian Markdown + 附件）
```

### 筆記結構

每篇筆記包含：

```yaml
---
title: "..."
source: X (Twitter)
author: "@handle"
date: 2026-03-09
url: "https://..."
tags: [x, archive, AI/工具]
category: AI/工具
keywords: [關鍵字1, 關鍵字2, ...]
summary: "120 字以內的客觀摘要"
---
```

- 正文（含連結轉 Markdown）
- **重點摘要** — AI 生成，中性專業語氣
- **內容分析** — 具體做法與技術細節
- **重點整理（條列）** — 可執行的行動要點
- 圖片 / 影片附件
- 評論區（如有）

## Telegram 指令

| 指令 | 說明 |
|------|------|
| 傳送 URL | 自動擷取並儲存（含評論）|
| `/search <查詢>` | 網頁搜尋 |
| `/monitor <關鍵字>` | 跨平台搜尋提及 |
| `/timeline @user [N]` | 抓取用戶最近 N 則貼文 |
| `/recent` | 本次啟動已儲存的內容 |
| `/status` | Bot 運行狀態 |
| `/learn` | 重新掃描 Vault 更新分類規則 |
| `/help` | 顯示說明 |

## 開發

```bash
npm run dev          # 開發模式（tsx 即時編譯）
npm run build        # 編譯 TypeScript
npm run test         # 執行測試（Vitest）
npm run lint         # ESLint 檢查
npm run format       # Prettier 格式化
```

### 專案結構

```
src/
├── index.ts                 # 啟動入口
├── bot.ts                   # Telegraf Bot 設定
├── classifier.ts            # 規則式內容分類器
├── saver.ts                 # Vault 存檔（dedup + 圖片下載）
├── commands/                # Telegram 指令處理
├── extractors/              # 各平台擷取器
│   ├── types.ts             # ExtractedContent 統一型別
│   ├── threads-extractor.ts
│   ├── x-extractor.ts
│   ├── tiktok-extractor.ts
│   └── ...
├── formatters/              # Markdown 格式化
├── learning/                # AI enrichment
│   └── ai-enricher.ts       # DDG AI Chat / CLI LLM
├── messages/                # 訊息處理管線
│   └── services/            # 管線階段（enrich, save, ...）
└── utils/
    ├── camoufox-pool.ts     # 瀏覽器實例池（max 2）
    ├── ddg-chat.ts          # DuckDuckGo AI Chat 介面
    ├── local-llm.ts         # LLM 統一入口
    └── url-canonicalizer.ts # URL 正規化
```

### 設計原則

- 所有 TypeScript 檔案 **≤ 300 行**
- **不使用任何付費 API**（無 Anthropic SDK、無 OpenAI）
- LLM enrichment 來源：DDG AI Chat（Camoufox）→ CLI fallback
- Enrichment 輸出過濾廢話與廣告語，保持中性專業語氣
- 外部呼叫必須有 timeout（HTTP 30s / yt-dlp 120s / Obsidian 10s）

## 故障排除

| 問題 | 解法 |
|------|------|
| `yt-dlp is not installed` | 安裝 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 並加入 PATH |
| `ffmpeg` 找不到 | 安裝 [ffmpeg](https://ffmpeg.org/) 並加入 PATH |
| TikTok 短連結失敗 | 先展開成完整 `tiktok.com/@.../video/...` 再重試 |
| `409 Conflict` | 前一個 Bot 未終止 → `taskkill /F /IM node.exe` 後重啟 |
| Threads 擷取失敗 | 確認 Camoufox 已下載：`npx camoufox-js fetch` |
| DDG AI Chat 暫時無法使用 | 自動 fallback 到 CLI LLM，不影響基本擷取 |

## 授權

ISC
