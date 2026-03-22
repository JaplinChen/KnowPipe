---
title: consolidate
description: 主題分佈分析 + 知識整合建議，觸發 Vault 中相關筆記的綜述生成
---

# /consolidate — 主題整合

分析 Vault 中的主題分佈，找出密集主題，生成整合建議。

## 使用方式

```
/consolidate              # 分析主題分佈 + 整合建議
/consolidate <topic>      # 針對特定主題整合（如 /consolidate GraphRAG）
```

---

## 執行步驟

### Step 1：讀取主題追蹤資料

```bash
cat "$(grep VAULT_PATH .env | cut -d'=' -f2)/GetThreads/.data/topic-tracker.json" 2>/dev/null
```

如果檔案不存在，掃描 `{VAULT_PATH}/GetThreads/**/*.md` 的 frontmatter 建立初始統計。

### Step 2：分析主題分佈

用 Read 工具讀取 `topic-tracker.json`，列出：
- 前 10 大分類（按筆記數排序）
- 每個分類的 top 5 關鍵字
- 超過 10 篇的密集主題標記為「建議整合」

### Step 3：如果有指定主題

1. 找出 Vault 中該主題所有筆記（用 Grep 搜尋 frontmatter 的 category 欄位）
2. 讀取每篇的 title、summary、keywords
3. 用繁體中文產出一篇整合綜述：
   - 該主題的核心工具/技術列表
   - 共同趨勢和模式
   - 知識缺口（有理論沒實作？有工具沒比較？）
   - 建議下一步蒐集的內容方向

### Step 4：輸出

```
主題分佈報告

| 分類 | 筆記數 | 熱門關鍵字 | 建議 |
|------|--------|-----------|------|
| AI/研究對話/Claude | 25 | claude code, skills | 🔴 建議整合 |
| AI/GraphRAG | 20 | rag, 知識圖譜 | 🔴 建議整合 |
| 生產力/Obsidian | 12 | obsidian, 插件 | 🟡 可整合 |
| AI/研究對話 | 8 | ai, 自動化 | ✅ 正常 |
...

密集主題整合建議：
- 「AI/研究對話/Claude」25 篇：建議整合為「Claude Code 生態工具總覽」
- 「AI/GraphRAG」20 篇：建議整合為「GraphRAG 技術方案比較」
```

---

## 與其他 Skill 的關係

| 場景 | 建議 |
|------|------|
| 需要生成新想法 | `/ideas` |
| 需要深度知識分析 | `/vault analyze` |
| 需要 Vault 清理 | `/vault maintain` |
