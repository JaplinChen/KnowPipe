---
name: auto-skill
description: "開發型任務的底層依賴（研究型任務跳過）。每次對話自動檢查知識庫並調用最佳實踐；建立跨技能經驗記憶層，讓下次使用同技能時能主動提醒。當用戶表達滿意時，必須詢問是否記錄經驗。"
---

# Auto-Skill 自進化知識系統

## 核心循環（Step 0–5）

你必須在每一輪對話中遵循以下核心循環：

### 0. 對話內快取（不對用戶展示）
在同一對話串中維護以下快取：
- `last_keywords`
- `last_topic_fingerprint`
- `last_index_lastUpdated`
- `last_matched_categories`
- `last_used_skills`（本回合用到的非 auto-skill 技能清單）
- `missing_experience_skills`（experience 未命中的技能）
- `loaded_experience_skills`（本對話已讀取過經驗的 skill-id）

### 1. 每回合先抽取關鍵詞（不讀檔）
- 從當前用戶訊息抽取 3–8 個核心名詞/短語（去重、統一大小寫）。
- 生成 `topic_fingerprint = 前 3 個關鍵詞`。

### 2. 判斷是否話題切換（不讀檔）
當出現以下任一條件，視為話題切換：
- 明確轉折詞：例如「另外」「改成」「換成」「再來」「順便」
- 本回合關鍵詞與 `last_keywords` 差異 >= 40%
- 用戶明確要求新增/修改分類

### 3. 跨技能經驗讀取（強制規則，不受話題切換影響）
只要本回合使用了任何「非 auto-skill」技能：
- 若該 `skill-id` 已存在於 `loaded_experience_skills`，本回合**不重讀**、**不重複提示**
- 否則必須執行以下步驟：
  1. 讀取 `experience/_index.json`
  2. 若找到對應 `skill-id`，必須載入該經驗檔 `experience/skill-[skill-id].md`
  3. 將該 `skill-id` 加入 `loaded_experience_skills`
  4. 回覆中必須提示：`我已讀取經驗：skill-xxx.md`
  5. 若 `experience/_index.json` 沒有該技能，記錄到 `missing_experience_skills`

### 4. 只在話題切換時讀取知識庫（knowledge-base）
若是本對話第一次回合或判定話題切換，才執行以下步驟：
- 讀取 `knowledge-base/_index.json`
- 以本回合關鍵詞匹配所有分類 `keywords`
- **匹配到多少分類就讀多少分類**（不做優先級排序）
- 若沒有匹配分類，依「動態分類」流程處理
- 若本回合有讀取任何分類檔，回覆中需加入一行提示：
  `我已讀取知識庫：design-layout.md, frontend-dev.md`
  （以實際讀取檔名替換，逗號分隔）

若不是話題切換，沿用 `last_matched_categories`，不重讀索引與分類檔。

### 5. 任務結束：主動記錄（最重要！）

> **任務明顯已完成**：你判斷本回合已高完成且值得記錄時
> **觸發詞**：用戶表達對任務滿意時

**你必須執行以下步驟：**
1. **總結經驗**：用一句話提煉本次解決方案的精華
2. **判斷價值**：這個經驗下次能幫用戶省時間嗎？
3. **主動詢問**：必須說出類似這樣的話：
   > 「這次我們解決了 [問題描述]，我想把這個經驗記錄到你的知識庫，下次遇到類似問題時可以直接參考。你覺得可以嗎？」
4. **執行記錄**：用戶同意後，依下列規則寫入並更新索引：
   - **跨技能經驗**：若本回合使用非 auto-skill，且該技能在 experience 中不存在或有新技巧 → 寫入 `experience/skill-[skill-id].md`，更新 `experience/_index.json`
   - **一般知識**：若為通用流程/偏好/解法 → 寫入 `knowledge-base/[category].md`，更新 `knowledge-base/_index.json`

**強制規則：缺少經驗時必問**
若本回合使用了非 auto-skill 技能，且該技能不在 `experience/_index.json`：
- 任務結束時必須主動詢問是否記錄本次使用經驗
- 詢問語句需明確指向該技能，例如：
  > 「這次使用了 health-check，但經驗庫沒有紀錄。我可以把這次的做法記錄下來嗎？」

---

## 記錄判斷準則

**核心問題：這東西下次能讓用戶省時間嗎？**

### General（knowledge-base）

**應該記錄（general）：**
- ✅ 可重用的流程與決策步驟（跨領域通用的操作順序/判斷流程）
- ✅ 高成本的錯誤與修正路徑（犯錯會浪費大量時間的情況）
- ✅ 關鍵參數/設定/前置條件（一變就影響結果的要素）
- ✅ 使用者偏好與風格規則（語氣、格式、設計風格、輸出結構）
- ✅ 多次嘗試才成功的方案（包含失敗原因與成功條件）
- ✅ 可套用的模板/清單/格式（會反覆使用的輸出樣式）
- ✅ 外部依賴或資源位置（檔案路徑、工具、素材）

**不應記錄（general）：**
- ❌ 一問一答、沒有可重用流程
- ❌ 純概念解釋（沒有具體做法或判斷標準）
- ❌ 沒有具體上下文、不可復用的結論

### Experience（非 auto-skill 經驗）

**應該記錄（experience）：**
- ✅ 使用該技能時踩到的坑與解法（含錯誤訊息/定位方式）
- ✅ 影響結果的關鍵參數或配置
- ✅ 可重用的模板/提示詞/工作流程（可直接套用）
- ✅ 依賴或資產路徑（字體、圖片、專案入口、模組位置）
- ✅ 需要特定順序或技巧才成功的步驟

**不應記錄（experience）：**
- ❌ 純理論或概念性解釋（留在 knowledge-base）
- ❌ 沒有可重現步驟的結論
- ❌ 一次性、不可重用的操作

---

## 條目格式

### knowledge-base 條目格式
```markdown
## 🔧 [簡短標題]
**日期：** YYYY-MM-DD
**情境：** 一句話描述使用場景
**最佳實踐：**
- [重點 1]
- [重點 2] - 參數說明和調整指南
```

### experience 條目格式
```markdown
## 🔧 [問題/技巧標題]
**日期：** YYYY-MM-DD
**技能：** [skill-id]
**情境：** 一句話描述本次問題
**解法：**
- 具體步驟 1
- 具體步驟 2
**關鍵檔案/路徑：**
- /path/to/file
**keywords：** keyword1, keyword2, keyword3
```

---

## 存儲路徑

所有路徑相對於 auto-skill 技能目錄（`~/.claude/skills/auto-skill/`）：

- 知識索引：`knowledge-base/_index.json`
- 知識內容：`knowledge-base/[category].md`
- 經驗索引：`experience/_index.json`
- 經驗內容：`experience/skill-[skill-id].md`

---

## 動態分類（僅 knowledge-base）

當用戶的問題不屬於現有分類時：
1. 建議創建新分類
2. 詢問用戶分類名稱和關鍵詞
3. 創建新的 `.md` 文件並更新 `_index.json`
