---
title: new-platform
description: 新平台支援全流程：腳手架生成 → 填入邏輯 → 測試驗證 → 提交，一條龍完成。含 scaffold-only 模式。
---

# /new-platform — 新平台支援全流程

腳手架生成 → 填入邏輯 → 測試驗證 → 提交的完整流程。

## 使用方式

```
/new-platform <name>                    # 完整流程
/new-platform <name> --with-comments    # 含評論抓取
/new-platform <name> --scaffold-only    # 只生成腳手架，不填邏輯
```

## 核心規則

- 每個 Phase 結束必須確認才進入下一步
- 生成的 extractor 必須 ≤ 300 行
- 遵守現有 Extractor/Formatter 架構慣例

---

## Phase 1：資訊收集

詢問用戶：
1. **URL 匹配模式**（如 `mastodon.social`, `*.mastodon.*`）
2. **API 類型**：公開 REST API / Jina Reader / Camoufox
3. **評論抓取**：是/否
4. **測試 URL**

---

## Phase 2：腳手架生成

### 2.1 新增 Platform type
`src/extractors/types.ts`

### 2.2 生成 Extractor
`src/extractors/<platform>-extractor.ts`：
```typescript
export const <platform>Extractor: Extractor = {
  platform: '<platform>',
  match(url) { return /PATTERN/i.test(url); },
  parseId(url) { /* TODO */ },
  async extract(url) { /* TODO */ },
};
```
若 `--with-comments`，用 `ExtractorWithComments` 介面。

### 2.3 註冊
`src/extractors/index.ts` — 在 webExtractor 之前加入。

### 2.4 Formatter（選擇性）
大多數用 defaultFormatter 即可。

### 2.5 驗證
```bash
npx tsc --noEmit
```

`--scaffold-only` 到此停止。

---

## Phase 3：填入抓取邏輯

1. 用 WebFetch/WebSearch 研究平台 API 或頁面結構
2. 填入 `match()`、`parseId()`、`extract()` 實際邏輯
3. 每步後 `npx tsc --noEmit`

---

## Phase 4：測試驗證

1. `/test extractor <url>` — 單平台測試
2. `/test smoke` — 確認不影響其他平台

---

## Phase 5：提交

驗證通過 → 繁體中文 commit message → 確認提交。

---

## 已註冊平台（供參考）

| 平台 | Extractor | 評論 |
|------|-----------|------|
| x | xExtractor | 有 |
| threads | threadsExtractor | 有 |
| youtube | youtubeExtractor | 無 |
| github | githubExtractor | 無 |
| reddit | redditExtractor | 有 |
| bilibili | bilibiliExtractor | 有 |
| weibo | weiboExtractor | 無 |
| xiaohongshu | xiaohongshuExtractor | 無 |
| douyin | douyinExtractor | 無 |
| tiktok | tiktokExtractor | 無 |
| ithome | ithomeExtractor | 無 |
| zhihu | zhihuExtractor | 無 |
| direct-video | directVideoExtractor | 無 |
| web | webExtractor（fallback）| 無 |
