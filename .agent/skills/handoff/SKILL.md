---
name: handoff
description: Session 結束前同步記憶 + 寫交接記錄，讓下次 /resume 無縫接力
---

# /handoff — Session 交接（含記憶同步）

## 何時使用

- 結束一個開發 session 之前
- 準備切換到新 session 繼續工作
- 達到 rate limit 需要中斷時

---

## 執行步驟

### Step 1：收集本次資訊

- 掃描修改過的檔案行數，確認實際完成的工作
- 確認 TypeScript 編譯狀態：`npx tsc --noEmit`

### Step 2：記憶同步（整合 /memory-sync）

檢查本次 session 是否有值得長期記住的知識：

**篩選標準**：
- ✅ 新的已知問題與解法（踩過的坑）
- ✅ 架構決策的原因
- ✅ 新增的 skill 或 command
- ✅ 外部服務行為變更
- ❌ 今天做了什麼任務（這是 handoff 的事）
- ❌ 目前進度（這是 handoff 的事）

若有值得記憶的知識 → 更新 MEMORY.md（保持 < 200 行）
若無新知識 → 跳過，不強制更新

### Step 3：寫入 `.claude/handoff.md`（覆蓋舊版）

```markdown
# Session 交接記錄
**日期**：YYYY-MM-DD HH:MM
**TypeScript 狀態**：✅ 零錯誤 / ❌ N 個錯誤

## 本次完成
| 檔案 | 操作 | 行數 | 說明 |
|------|------|------|------|
| ... | 修改 | 285 行 | 說明 |

### 新建的模組
- `src/xxx.ts` - 說明

### 架構決定
- 決定 A：原因
- 決定 B：原因

## 下一步（按優先順序）
1. [具體任務和檔案]
2. [具體任務和檔案]

## 接力文字（貼給下一個 session 開場用）
> 繼續 GetThreads 工作。讀 `.claude/handoff.md`。
> 上次完成了 [簡短說明]，TypeScript 零錯誤。
> 下一步是 [具體檔案和任務]。
```

### Step 4：確認寫入成功

輸出確認訊息，提示使用者「下次可以直接執行 /resume」。

---

## 整合關係

```
/handoff
├── 收集修改資訊
├── /memory-sync（自動整合）
│   ├── 篩選穩定知識
│   └── 更新 MEMORY.md（若有新知識）
├── 寫入 handoff.md
└── 輸出確認

以前需要手動執行：
  /memory-sync → /handoff（兩步）
現在一步完成：
  /handoff（自動含記憶同步）
```

---

## 注意事項

- 如果 TypeScript 有錯誤，**不要假裝沒有**，如實記錄並說明原因
- 接力文字要夠具體，讓 Claude 不需要重掃整個 codebase
- 每次 handoff 完整覆蓋，不累積舊記錄
- MEMORY.md 更新要精簡，不要把 session 細節塞進去
