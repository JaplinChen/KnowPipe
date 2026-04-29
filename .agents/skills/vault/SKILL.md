---
title: /vault — Vault 統一管理
description: Vault 維護、修復、知識萃取三合一：/vault maintain | fix | analyze
---

# /vault — Vault 統一管理

整合維護、修復、知識萃取的完整 Vault 管理工具。

## 使用方式

```
/vault maintain              # 完整維護（報告 + 分類評估 + metadata + summary）
/vault maintain --report     # 唯讀報告
/vault maintain --reclassify # 只做重新分類
/vault fix                   # 掃描並修復品質問題
/vault analyze               # 增量知識萃取
/vault analyze --full        # 強制全量重新分析
/vault analyze --topic AI    # 只分析特定分類
```

---

## maintain 模式

### Step 1：Vault 健康報告
用 tsx 掃描 `{VAULT_PATH}/ObsBot/`：
- 分類分布統計
- 最近 7 天新增
- 空資料夾偵測
- 可疑筆記（標題過短、內容過少、無來源 URL）

### Step 2：分類評估（不自動搬移）
讀取所有筆記的 frontmatter，用最新 classifier 重新評估。
**只輸出建議清單**，用戶確認後才移動。

### Step 3：Metadata 完整性
檢查必要欄位：`title`, `source`, `date`, `url`, `category`

### Step 4：缺失 Summary 補充
若設定了 enricher → 用 AI 生成 summary → 更新 frontmatter

### `--report` 模式
只執行 Step 1。

### `--reclassify` 模式
先 `npx tsc --noEmit` → Step 2 → 確認 → 執行移動。

---

## fix 模式

掃描 ObsBot Vault 筆記，偵測 6 種品質問題並自動修復。

### 偵測項目

1. **空白摘要**：frontmatter `summary` 為空或缺失
2. **缺少關鍵字**：frontmatter `keywords` 為 `[]` 或缺失
3. **HTML 殘留**：正文包含 HTML 標籤
4. **壞圖片連結**：`![](attachments/...)` 路徑不存在
5. **缺少 frontmatter 欄位**：缺少 title/url/date/category/tags
6. **空正文**：frontmatter 後 < 20 字

### 自動修復（可修的問題）
- HTML 殘留 → regex 清除
- 缺少 category → `classifyContent()` 重新分類
- 壞圖片連結 → 移除不存在的 embed 行

### 不自動修復（需 /reprocess）
- 空白摘要、缺少關鍵字、空正文

### 輸出報告
```
| 問題類型 | 數量 | 已修復 |
| HTML 殘留 | 5 | 5 ✅ |
| 空白摘要 | 8 | — （需 /reprocess） |
```

---

## analyze 模式

掃描所有筆記，萃取結構化知識，寫入 `data/vault-knowledge.json`。

### Phase 1：掃描
- 增量模式：用 MD5 hash 比對，跳過未改變的筆記
- `--full`：強制全量重新分析

### Phase 2：批次知識萃取（每次 5 篇）

對每篇萃取：
- **實體**（最多 10 個）：tool | concept | person | framework | company | technology
- **洞察**（最多 8 個）：principle | pattern | warning | best_practice | tip
- **關係**（最多 6 個）：uses | compares | builds_on | alternative_to | part_of
- **品質分數**（1-5）

### Phase 3：寫入 + 產生筆記
1. 更新 `data/vault-knowledge.json`
2. 產生 `ObsBot/知識庫摘要.md`（統計 + 核心實體 + 關鍵洞察）
3. 產生 `ObsBot/知識地圖.md`（分類列表 + 關聯圖 + 缺口）
4. 產生 Codex 命令（若有高密度主題）

### Phase 3.5：用戶偏好模型
```bash
npx tsx --tsconfig tsconfig.json scripts/extract-preferences.ts
```
更新 MEMORY.md 的用戶偏好段落。

---

## 安全規則

- **maintain**：不自動搬移，只建議。永遠不刪除筆記。
- **fix**：修改前確認 git status 乾淨。
- **analyze**：唯讀分析，不修改 Vault 筆記。只新增/更新分析結果。
