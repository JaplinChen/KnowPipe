---
title: research-to-pr
description: 研究→實作→PR 一條龍：從文章/Repo 出發，產出整合 PR
---

# /research-to-pr — 研究到 PR 一條龍

從一篇文章、一個 GitHub Repo、或一個工具名稱出發，完成研究→設計→實作→文檔→PR 的完整流程。

## 使用方式

```
/research-to-pr <url>           # 從 URL 出發（文章或 GitHub repo）
/research-to-pr <tool-name>     # 從工具名稱出發（自動搜尋）
```

---

## 執行步驟

### Phase 1：研究（Research）

1. **資料蒐集**（用 Agent 並行）：
   - 如果是 URL → 讀取內容、提取核心概念和 API
   - 如果是 GitHub repo → 讀取 README、查看 package.json/setup 步驟
   - 如果是工具名稱 → WebSearch 搜尋官方文檔和使用範例
   - 同時搜尋 Vault 中是否已有相關筆記（Grep `{VAULT_PATH}/GetThreads/`)

2. **摘要輸出**：
   - 工具/技術的一句話描述
   - 核心功能（3-5 個）
   - 與 GetThreads 的整合點（匹配現有 pipeline 的哪個環節）
   - 前置條件（需要安裝什麼、需要什麼 API key）

### Phase 2：設計確認（Design）

1. 提出整合方案（最多 2 個選項）
2. 說明影響範圍（會改哪些檔案）
3. **等待用戶確認後才繼續**

### Phase 3：實作（Implement）

用 TodoWrite 追蹤每個步驟：

1. 建立新 branch：`feat/<feature-name>`
2. 如果需要新依賴 → `npm install`
3. 實作程式碼（遵循 CLAUDE.md 硬規則）
4. 每個檔案修改後 → `npx tsc --noEmit` 驗證
5. 如果是新 extractor → 用 `/new-platform` scaffold
6. 如果修改 classifier → 跑回歸測試

### Phase 4：文檔（Document）

1. 更新 README 的相關段落（如果功能顯著）
2. 如果是新功能 → 加到 README 的功能列表
3. 不要過度文檔——只更新受影響的部分

### Phase 5：提交 PR（Ship）

1. 用繁體中文寫 commit message：`feat: <描述>`
2. Push 到 remote
3. 用 `gh pr create` 建立 PR，包含：
   - 研究來源（URL/文章標題）
   - 變更摘要
   - 測試方式

---

## 輸出格式

每個 Phase 完成後簡短回報：

```
✅ Phase 1：研究完成
- 工具：{name} — {一句話描述}
- 整合點：{pipeline 環節}
- 前置條件：{列表}

⏳ Phase 2：設計確認
方案 A：{描述}
方案 B：{描述}
影響檔案：{列表}

👉 請確認採用哪個方案
```

---

## 與其他 Skill 的關係

| 場景 | 使用 |
|------|------|
| 只做研究不實作 | 用 Agent explore |
| 已有方案只需實作 | `/dev` |
| 實作完需要提交 | `/ship` |
| 需要新平台 extractor | `/new-platform` |
