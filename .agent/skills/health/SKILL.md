---
name: health
description: 即時健康快照：10 秒內完成 TS 編譯、行數、進程、Bot、Git 狀態檢查
---

# /health — 即時健康快照

輕量版 `/weekly`，開發過程中隨時呼叫，不打斷工作流。

## 使用方式

```
/health              # 10 秒健康快照（5 項並行）
```

---

## 核心規則

- 全部唯讀，不修改任何檔案
- 所有檢查並行執行，10 秒內完成
- 單一表格輸出，一目了然
- 發現問題時指向具體修復 skill

---

## 執行流程（全部並行）

用 Bash 並行執行以下 5 項檢查：

**1. TypeScript 編譯**
```bash
npx tsc --noEmit 2>&1 | tail -3
```

**2. 行數掃描**
```bash
wc -l src/**/*.ts src/**/**/*.ts 2>/dev/null | sort -rn | head -5
```
超過 300 行 → 標記 ⚠️

**3. 殭屍進程**
```bash
tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul
```

**4. Bot 狀態**
```bash
# 檢查 PID lockfile
[ -f .bot.pid ] && echo "PID: $(cat .bot.pid)" || echo "未運行"
```

**5. Git 狀態**
```bash
git status --short | wc -l
git log --oneline -1
```

---

## 輸出格式

```
⚡ 健康快照
━━━━━━━━━━━━━━━━━━
| 項目      | 狀態 | 詳情              |
|-----------|------|-------------------|
| TS 編譯   | ✅   | 零錯誤            |
| 行數合規  | ⚠️   | bot.ts:302        |
| 殭屍進程  | ✅   | 0 個 node.exe     |
| Bot 狀態  | 🟢   | PID 167048        |
| Git 狀態  | 📝   | 3 uncommitted     |
```

---

## 與其他 Skill 的關係

| 發現問題 | 建議 |
|---------|------|
| TS 編譯失敗 | 手動修復 |
| 行數超標 | `/refactor --modularize` |
| 殭屍進程 | `/launch --stop` |
| Bot 未運行 | `/launch` |
| 大量未提交 | `/ship` |
