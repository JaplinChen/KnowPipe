---
title: sync-context
description: 掃描程式碼庫，自動同步 CLAUDE.md 的專案狀態區段 + 匯出跨工具 context
---

# /sync-context — 上下文同步

## 使用方式
```
/sync-context              # 同步 CLAUDE.md 自動區段
/sync-context --all        # 同步 CLAUDE.md + .cursorrules + 顯示 system prompt
/sync-context --cursorrules # 只生成 .cursorrules
/sync-context --system-prompt # 只輸出 oMLX system prompt
```

## 核心規則
- 只修改 `<!-- AUTO-GENERATED-START -->` 和 `<!-- AUTO-GENERATED-END -->` 之間的內容
- 不觸碰 CLAUDE.md 手動維護的 Hard Rules / Guidelines 區段
- 首次執行時自動在檔案末尾附加標記區段

## 執行流程
1. 執行 `npx tsx scripts/sync-context.ts` 加上對應參數
2. 顯示更新摘要（提取器數量、指令數量、功能狀態）

## 使用時機
- 新增/移除 extractor 或 command 後
- 每週維護時（建議整合進 /weekly）
- 架構有顯著變更時
- 需要為其他 AI 工具生成 context 時

## 與其他 Skill 的關係
- **/weekly**：可在維護流程中呼叫 `/sync-context` 保持狀態同步
- **/ship**：提交前呼叫確保 CLAUDE.md 反映最新變更
- **/health**：健康檢查可參考 manifest 的提取器/指令數量
