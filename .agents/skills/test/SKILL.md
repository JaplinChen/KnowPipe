---
title: test
description: 統一測試入口：/test classify（分類器）、/test extractor <url>（單平台）、/test smoke（管線冒煙）、/test status（健康檢查）
---

# /test — 統一測試入口

## 使用方式

```
/test classify              # 分類器回歸測試
/test extractor <url>       # 測試特定 URL 的抓取
/test smoke                 # 管線冒煙（X + GitHub + Reddit）
/test smoke --full          # 全平台冒煙
/test status                # 所有 extractor 健康檢查
```

---

## classify 模式

驗證 `classifier.ts` 的分類邏輯，防止關鍵詞改動造成 regression。

### 流程
1. `npx tsc --noEmit`
2. 用 `tsx -e` 執行測試案例（應命中 + 不應過廣命中 + 邊界案例）
3. 輸出表格：標題 | 預期 | 實際 | 結果 | 備註
4. 失敗 → 附上命中的關鍵詞，定位原因

### 測試腳本

```bash
npx tsx --tsconfig tsconfig.json -e "
import { classifyContent } from './src/classifier.js';
const cases = [
  { title: 'Codex 完整教學', body: '', expected: 'AI/研究對話/Codex', note: 'Codex 關鍵字' },
  { title: 'Prompt Engineering 入門', body: '', expected: 'AI/寫作輔助', note: 'prompt engineering' },
  { title: 'DeepSeek vs GPT-4o 評測', body: '', expected: 'AI/研究對話/OpenAI', note: 'gpt-4o 在 CATEGORIES 排前面，同分時勝出' },
  { title: '如何用 Python 寫 API', body: '', expected: '程式設計', note: 'python 關鍵字' },
  { title: '今日股市分析 ETF 配置', body: '', expected: '投資理財', note: 'etf 關鍵字' },
  { title: 'Obsidian 筆記工作流', body: '', expected: '生產力/Obsidian', note: 'obsidian 關鍵字' },
  { title: '我用了三個月的學習心得', body: '完全不提 AI', expected: '其他', note: '無命中關鍵字' },
  { title: '旅遊日記', body: '', expected: '生活', note: '旅遊 → 生活，不觸發科技' },
  { title: '人工智慧時代的職場焦慮', body: '', expected: 'AI/研究對話', note: '人工智慧 → AI/研究對話' },
  { title: '機器學習入門完全指南', body: '', expected: 'AI/研究對話', note: '機器學習 → AI/研究對話' },
];
let passed = 0, failed = 0;
for (const c of cases) {
  const actual = classifyContent(c.title, c.body);
  const ok = actual === c.expected;
  if (ok) passed++; else failed++;
  console.log(\`| \${c.title.slice(0,30)} | \${c.expected} | \${actual} | \${ok ? 'pass' : 'FAIL'} | \${c.note} |\`);
}
console.log(\`\\n結果：\${passed} 通過，\${failed} 失敗\`);
if (failed > 0) process.exit(1);
"
```

---

## extractor 模式

對特定 URL 執行真實抓取測試。

### 流程
1. `npx tsc --noEmit`
2. 用 `tsx -e` 呼叫 `extractContent(url)`
3. 輸出：平台、標題、字數、圖片數、耗時、完整 JSON
4. 超時：HTTP 30s、yt-dlp 120s

---

## smoke 模式

不啟動 Bot，直接 import 模組測試 extract → classify → format 管線。

### 快速模式（預設）

| 平台 | 測試 URL | 預期 |
|------|---------|------|
| X | `https://x.com/elikiiii__/status/1863393037671014626` | title 非空 |
| GitHub | `https://github.com/anthropics/Codex` | title 含 'Codex' |
| Reddit | `https://www.reddit.com/r/ClaudeAI/comments/1i2578u/claude_code_best_practices/` | title 非空 |

### --full 模式追加

| 平台 | 測試 URL | 備註 |
|------|---------|------|
| Threads | `https://www.threads.net/@zuck/post/DTa3-B1EbTp` | Camoufox |
| Bilibili | `https://www.bilibili.com/video/BV1GJ411x7h7` | 公開 API |
| Web | `https://bnext.com.tw/article/72430/obsidian-notion-knowledge` | Jina Reader |

### 核心規則
- 不啟動 Bot，不存檔
- 使用真實網路（不 mock）
- `Promise.allSettled`（任一失敗不阻塞其他）

### 測試腳本

建立暫存 `smoke-test.ts`，用 `npx tsx --tsconfig tsconfig.json smoke-test.ts` 執行：
- `registerAllExtractors()` → `findExtractor(url)` → `extract()` → `classifyContent()` → `formatAsMarkdown()`
- 輸出表格：平台 | Extract | Classify | Format | 耗時 | 標題
- 完成後刪除暫存腳本

---

## status 模式

對所有平台 extractor 執行健康檢查。

### 測試項目（每平台）
1. `match(url)` 是否正確匹配
2. `parseId(url)` 是否能提取 ID
3. `extract(url)` 是否正常回傳（30s 超時）

### 測試 URL

| 平台 | URL | 備註 |
|------|-----|------|
| threads | `https://www.threads.net/@zuck/post/DTa3-B1EbTp` | Camoufox |
| youtube | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | yt-dlp |
| github | `https://github.com/anthropics/Codex` | API |
| reddit | Reddit ObsidianMD post | API |
| bilibili | `https://www.bilibili.com/video/BV1GJ411x7h7` | API |
| web | `https://example.com` | fallback |
| weibo/xhs/douyin | 跳過 | 需登入 |

### 輸出

```
| 平台 | match | parseId | extract | title | text 長度 | 耗時 | 狀態 |
```

DOM 變更偵測：若 extract 失敗，分析錯誤訊息判斷是否為結構變更。

---

## 診斷提示

| 現象 | 可能原因 | 行動 |
|------|---------|------|
| result null | 解析失敗 | curl 手動測目標 URL |
| HTTP 4xx | 被封鎖/需登入 | 檢查 headers |
| timeout | 超過 30s | 確認 AbortController |
| title 空 | CSS selector 失效 | 更新 extractor |
