# GetThreads — AI Coding Agent Instructions

> 適用於 Codex CLI / OpenCode。專案規則 + 13 個開發技能的濃縮版。

## 專案概況

- **用途**：Telegram Bot，抓取社群內容存到 Obsidian Vault
- **語言**：TypeScript（Telegraf + tsx）
- **架構**：extractor → classifier → formatter → saver 管線
- **路徑**：`C:\Works\GetThreads`

## 核心規則

### Build & Verification
- 修改任何 `.ts` 後必須 `npx tsc --noEmit` 零錯誤
- 所有 TypeScript 檔案 **≤ 300 行**

### Windows 環境
- BAT 檔：CP950 編碼 + CRLF + 無 BOM，`echo` 中不可用 `||`
- 進程管理用 `tasklist` / `taskkill`
- 路徑用 `path.join()`

### 架構原則
- 新功能整合進 URL 處理 pipeline，不另建 command
- 遵循 extractor → formatter → saver 管線
- 不使用任何 API SDK（無 Anthropic/OpenAI SDK）
- 不使用本地 LLM / Ollama

### Post-Fix Checklist
- 修改 extractor/formatter 後，必須檢查已存在的 Vault 筆記
- 修改 classifier 後，跑回歸測試（注意 substring 匹配陷阱）

### Git
- Commit message 繁體中文：`<type>: <描述>`
- 功能完成後 commit + push
- 顯著變更時同步更新 README

---

## 開發技能速查

### /ship — 驗證 + 提交 + 推送

```
自動偵測範圍（≥3 檔案=深度，<3=快速）
快速驗證：tsc + 行數 + secrets + dead imports（並行）
深度追加：分類器回歸 + 搜尋引擎 + 管線冒煙
調試碼掃描 → Vault 影響評估 → commit → README → push
```

### /test — 統一測試

```
/test classify    — 分類器回歸（10+ 案例，表格輸出）
/test extractor   — 單 URL 真實抓取（30s timeout）
/test smoke       — 管線冒煙（X + GitHub + Reddit）
/test smoke --full — 全平台（+ Threads + Bilibili + Web）
/test status      — 所有 extractor 健康檢查（match + parseId + extract）
```

### /refactor — 重構全流程

```
Phase 1：影響分析（grep 依賴圖 → 輸出影響圖）
Phase 2：遷移計畫（型別→生產者→消費者）
Phase 3：逐步執行（每步 tsc --noEmit）
Phase 4：冒煙測試
Phase 5：提交
--modularize：掃描 >300 行檔案，批次拆分
--dry-run：僅分析不修改
```

### /vault — Vault 管理

```
/vault maintain          — 健康報告 + 分類評估 + metadata
/vault maintain --report — 唯讀報告
/vault fix               — 偵測 6 種品質問題並修復（HTML殘留/壞連結/缺欄位）
/vault analyze           — 知識萃取（實體/洞察/關係→vault-knowledge.json）
/vault analyze --full    — 全量重新分析
```

### /launch — Bot 管理

```
/launch           — 標準：kill → tsc → npm run dev → 監控 15s
/launch --force   — 強制：殺所有 node → 等 5s → tsc → start → 409 重試
/launch --diagnose — WMIC 進程分析 → 精確 kill → 網路連線 → deleteWebhook
/launch --stop    — 安全停止：taskkill → 驗證 → 清 lockfile
409 持續 → 自動升級：標準 → force → diagnose
```

### /dev — 功能開發全流程

```
Phase 1：設計確認（/design 核心邏輯）
Phase 2：實作（每步 tsc 驗證）
Phase 3：冒煙測試（/test smoke）
Phase 4：驗證提交（/ship）
```

### /design — 架構確認

```
用戶描述 → 研究現有程式碼 → 提出方案 → POC 驗證 → 確認後實作
```

### /new-platform — 新平台支援

```
Phase 1：收集資訊（URL模式 + API類型 + 測試URL）
Phase 2：腳手架（types.ts + extractor + index.ts 註冊）
Phase 3：填入抓取邏輯
Phase 4：/test extractor + /test smoke
Phase 5：提交
--scaffold-only：只生成腳手架
```

### /health — 即時快照

```
並行 5 項：tsc 編譯 + 行數 + 進程 + Bot 狀態 + Git
10 秒內完成
```

### /weekly — 週維護

```
並行 4 項：專案健康 + Vault 報告 + 程式碼審計 + 依賴檢查
--full 追加：全平台 extractor 測試 + 搜尋引擎 + Vault 分類評估
全部唯讀，不修改檔案
```

### /resume — Session 啟動

```
讀取交接記錄 → 完整健康報告 → 環境掃描 → 30 秒進入工作狀態
```

### /handoff — Session 交接

```
同步記憶 → 寫交接記錄（進度/未完成/注意事項）
```

---

## 測試 URL 參考

| 平台 | 穩定 URL |
|------|---------|
| X | `https://x.com/elikiiii__/status/1863393037671014626` |
| GitHub | `https://github.com/anthropics/claude-code` |
| Reddit | `https://www.reddit.com/r/ClaudeAI/comments/1i2578u/claude_code_best_practices/` |
| Threads | `https://www.threads.net/@zuck/post/DTa3-B1EbTp` |
| Bilibili | `https://www.bilibili.com/video/BV1GJ411x7h7` |

## 常見問題

| 症狀 | 處理 |
|------|------|
| 409 Telegram Conflict | `/launch --force`，仍失敗用 `--diagnose` |
| tsc 編譯錯誤 | 修復後重新驗證 |
| 抓取失敗 | 先 curl 手動測目標 URL |
| 行數超標 | `/refactor --modularize` |
| 分類器 regression | `/test classify` 定位 → 修復 |
