---
name: resume
description: Session 自動啟動：讀取交接 + 完整健康報告 + 環境掃描，30 秒進入工作狀態
---

# /resume — Session 自動啟動

讀取交接記錄 + 完整健康報告，30 秒內進入工作狀態。
**此 skill 在每次 session 開始時自動執行，不需手動輸入。**

---

## 執行步驟

### Step 1：尋找交接記錄

依序搜尋：
- `.claude/handoff.md`（專案根目錄）
- `handoff.md`（當前目錄）

### Step 2：健康報告（並行執行 6 項檢查）

```bash
# 1. TypeScript 編譯
npx tsc --noEmit 2>&1 | tail -3

# 2. 殭屍進程
tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul | find /c "node.exe"

# 3. 行數合規（最大檔案）
wc -l src/**/*.ts src/**/**/*.ts 2>/dev/null | sort -rn | head -5

# 4. PID lockfile
[ -f .bot.pid ] && echo "PID: $(cat .bot.pid)" || echo "無 lockfile"

# 5. Vault 7 天新增
VAULT_PATH=$(grep VAULT_PATH .env | cut -d'=' -f2)
find "$VAULT_PATH/GetThreads" -name "*.md" -mtime -7 -type f 2>/dev/null | wc -l

# 6. Secrets 掃描
grep -rn "BOT_TOKEN\s*=\s*['\"][0-9]" src/ || echo "✅"
grep -rn "ANTHROPIC_API_KEY\s*=\s*['\"]sk-" src/ || echo "✅"
```

### Step 3：重建待辦

- 若有交接記錄 → 用 TodoWrite 重建待辦清單（根據「下一步」區塊）
- 若無交接記錄 → 掃描超標檔案建立新計畫

### Step 4：情境建議

| 條件 | 建議 |
|------|------|
| 週六或週日 | 建議執行 `/weekly` |
| 行數超標 | 建議 `/refactor --modularize` |
| TS 編譯失敗 | 先修錯再開始 |
| 殭屍進程 | 建議 `/launch --force` |
| Vault 7天新增 > 20 篇 | 建議 `/vault maintain --report` |

### Step 5：直接開始工作

確認後立即開始，不需要等使用者再次確認。

---

## 開場輸出格式

```
## Session 啟動

| 項目 | 狀態 | 詳情 |
|------|------|------|
| TypeScript | ✅ | 零錯誤 |
| 行數 | ✅ | 最大 245 行 |
| 進程 | ✅ | 無殘留 |
| Lockfile | ✅ | 不存在 |
| Vault 7天 | 📊 | 12 篇新增 |
| Secrets | ✅ | 無洩漏 |

**上次完成**：[簡述]
**今天繼續**：
1. [任務 1]
2. [任務 2]

開始執行...
```

若環境有問題：
```
## Session 啟動

| 項目 | 狀態 | 詳情 |
|------|------|------|
| TypeScript | ❌ | 3 errors |
| 行數 | ⚠️ | bot.ts 310 行 |
| 進程 | ⚠️ | 2 個 node.exe |

**需先處理**：
- TS 錯誤：src/xxx.ts:42 → [錯誤訊息]
- 殭屍進程：建議 /launch --force
- 行數超標：建議 /refactor --modularize

修復後再繼續...
```

---

## 注意事項

- 不要重做已完成的工作
- 若 TypeScript 狀態與 handoff 記錄不符，先修錯再繼續
- 環境問題先修，再開始任務
- 確認後立即開始，不需要等使用者再次確認
