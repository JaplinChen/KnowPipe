---
title: /ship — 驗證 + 提交 + 推送
description: 開發完成一鍵交付：自動偵測範圍 → 驗證 → 調試碼掃描 → commit → README → push
---

# /ship — 驗證 + 提交 + 推送

整合驗證、提交、推送的完整交付流程。自動偵測修改範圍，選擇對應驗證路徑。

## 使用方式

```
/ship              # 自動偵測（≥3 檔案 → 深度，<3 → 快速）
/ship --quick      # 強制快速路徑
/ship --deep       # 強制深度路徑（含分類器回歸 + 管線冒煙）
```

## 核心規則

- 任何驗證失敗 → **停止，先修復**
- `console.log` 在 bot.ts 的 `[msg]` 日誌是生產用的，不報告
- Commit message 使用繁體中文
- 用戶確認後才 commit + push

---

## Phase 1：自動偵測修改範圍

```bash
git diff --stat HEAD
git status --short
```

- 修改 ≥ 3 個 `.ts` → **深度路徑**
- 修改 < 3 個 `.ts` → **快速路徑**
- 改動 `classifier.ts` → 強制加入分類器回歸
- 改動 `extractors/` 或 `formatters/` → 強制加入管線冒煙

---

## Phase 2A：快速驗證（並行 4 項）

**1. TypeScript 編譯**
```bash
npx tsc --noEmit
```

**2. 行數掃描**
超過 300 行 → ❌ 建議 `/refactor --modularize`

**3. Secrets 掃描**
```bash
grep -rn "BOT_TOKEN\s*=\s*['\"][0-9]" src/ || echo "✅"
grep -rn "ANTHROPIC_API_KEY\s*=\s*['\"]sk-" src/ || echo "✅"
grep -rn "api[_-]?key.*=.*['\"]" src/ --include="*.ts" | grep -v "config\|\.env\|process\.env" || echo "✅"
```

**4. 死引用檢查**
```bash
grep -rn "from '\.\." src/ --include="*.ts" -h | sed "s/.*from '//;s/'.*//" | sort -u | while read p; do
  f=$(echo "$p" | sed 's|\.js$|.ts|'); [ -f "src/$f.ts" ] || [ -f "${f}.ts" ] || echo "MISSING: $p"
done
```
驗證所有 `from '..'` import 路徑對應的 `.ts` 檔案存在。

---

## Phase 2B：深度驗證（追加）

先執行 2A，再**並行**加入：

**5. 分類器回歸**：用 `/test classify` 核心邏輯（測試案例回歸）。

**6. 搜尋引擎健康**：DDG POST 搜尋測試。

**7. 管線冒煙（若改動 extractors/formatters）**：
用 `/test smoke` 快速模式（X + GitHub + Reddit），驗證 extract → classify → format 管線。

---

## Phase 3：調試碼掃描（警告，不阻塞）

```bash
grep -rn "console\.log" src/ --include="*.ts" | grep -v "node_modules"
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" | grep -v "node_modules"
```

---

## Phase 4：Vault 影響評估

若 `git diff --name-only` 包含 `extractors/` 或 `formatters/`：
→ 警告「建議先執行 `/reprocess --all --since 1d` 更新已存在的 vault 筆記」

---

## Phase 5：暫存與提交

- `git add`（排除 .env、data/、temp/、*.log）
- 繁體中文 commit message：`<type>: <描述>`
  - type：feat / fix / refactor / docs / chore
- 展示完整報告，詢問確認

---

## Phase 6：README 更新判斷

若涉及新 Bot 指令、新平台 extractor、用戶可見變更 → 更新 README.md。

---

## Phase 7：推送

```bash
git push origin main
```

---

## Phase 8：輸出摘要

```
✅ /ship 完成（深度模式）

驗證：
  TypeScript: ✅ | 行數: ✅ | Secrets: ✅ | Import: ✅
  分類器回歸: ✅ 22/22 | 搜尋引擎: ✅
  調試碼: ✅ 無殘留

變更摘要（5 檔案）：
  ✏️ src/bot.ts (+25, -40)
  🆕 src/utils/search-service.ts (+183)

Commit: abc1234 — feat: 描述
Push: ✅ origin/main
Vault 影響: ⚠️ 建議 /reprocess（或 ✅ 無影響）
```

---

## 失敗處理

| 失敗項目 | 處理方式 |
|---------|---------|
| TypeScript | 修復後重新 `/ship` |
| 行數超標 | `/refactor --modularize` |
| Hardcoded secret | 立即移除 |
| 分類器回歸 | 修復 classifier.ts |
| 管線冒煙 | 修復對應 extractor/formatter |
