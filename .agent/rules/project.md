# GetThreads 專案規則

## Build & Verification
- 修改任何 `.ts` 後必須 `npx tsc --noEmit` 零錯誤
- 所有 TypeScript 檔案 **≤ 300 行**，超過必須拆分

## Windows 環境
- BAT 檔：CP950 編碼 + CRLF + 無 BOM，`echo` 中不可用 `||`
- 進程管理用 `tasklist` / `taskkill`，不用 `ps` / `kill`
- 路徑用 `path.join()`

## 架構原則
- 新功能整合進 URL 處理 pipeline（extractor → classifier → formatter → saver）
- 新 extractor 用腳手架生成，不從零手寫
- 不使用任何 API SDK（無 Anthropic/OpenAI SDK）
- 不使用本地 LLM / Ollama

## Post-Fix Checklist
- 修改 extractor/formatter 後，必須檢查已存在的 Vault 筆記
- 修改 classifier 後，跑回歸測試（注意 substring 匹配陷阱）
- 搬移檔案前先做 dry-run

## Git Workflow
- Commit message 繁體中文：`<type>: <描述>`
- type：feat / fix / refactor / docs / chore
- 功能完成後 commit + push
- 顯著變更時同步更新 README

## Debug 策略
- 先診斷再修復，不猜測
- 一次只驗證一個假設
- 不重試相同失敗方法超過 2 次

## 語言
- 所有回覆使用繁體中文
