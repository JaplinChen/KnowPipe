---
name: weekly
description: 每週一鍵維護：專案健康 + 依賴檢查 + Vault 維護 + 超時/BAT 審計，並行執行
---

# /weekly — 每週一鍵維護

整合專案健康報告 + 依賴健康檢查 + `/vault maintain --report` + 超時保護/BAT 格式審計的完整維護流程。

## 使用方式

```
/weekly              # 標準維護（並行 3 項，約 2 分鐘）
/weekly --full       # 完整維護（含網路測試 + Vault 分類評估，約 8 分鐘）
```

---

## 核心規則

- 全部唯讀，不修改任何檔案
- 並行執行最大化速度
- 統一輸出一份報告
- 發現問題時指向具體修復 skill

---

## 標準模式

### 並行組（同時執行 4 項）

用 Task 工具並行：

**Task 1：專案健康報告**
```bash
# 1. TypeScript 編譯
npx tsc --noEmit 2>&1

# 2. 行數掃描
wc -l src/**/*.ts src/**/**/*.ts 2>/dev/null | sort -rn | head -20

# 3. 殭屍進程
tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>/dev/null

# 4. Secrets 掃描
grep -rn "BOT_TOKEN\s*=\s*['\"][0-9]" src/ || echo "✅"
grep -rn "ANTHROPIC_API_KEY\s*=\s*['\"]sk-" src/ || echo "✅"

# 5. src/learning/ 統計
ls src/learning/*.ts 2>/dev/null | wc -l
```

**Task 2：Vault 健康報告（/vault maintain --report 核心邏輯）**
- 分類分布統計
- 最近 7 天新增
- 空資料夾
- 可疑筆記

**Task 3：程式碼審計**
- **超時保護掃描**：Grep 搜尋 `fetch(`/`exec(`/`spawn`/`curl` 呼叫，檢查附近 10 行有無 `timeout`/`AbortController`/`signal`/`--max-time`
- **BAT 格式驗證**：用 Node.js 檢查所有 `.bat` 檔案的 BOM（前 3 bytes）、CRLF 行尾、`||` 陷阱、`cd /d` 位置、特殊字元

**Task 4：依賴健康檢查**
- `npm outdated` 過期套件統計
- `npm audit` 安全漏洞統計
- 重要依賴版本：telegraf、camoufox-js、yt-dlp

---

## --full 模式（追加）

標準模式完成後，再執行：

**Task 5：全平台 Extractor 測試**
- 用預設 URL 測試所有平台 extractor（Threads/X/Reddit/YouTube/GitHub/Web）
- 每個 URL 用 `extractContent()` 抓取，記錄耗時和結果

**Task 6：搜尋引擎測試**
- DDG POST 搜尋測試（用 `webSearch()` 驗證）
- Reddit API 搜尋測試（用 `searchReddit()` 驗證）

**Task 7：Vault 分類評估（/vault maintain 核心邏輯）**
- 用最新 classifier 重新評估所有筆記
- 輸出建議搬移清單（不自動搬移）

---

## 輸出格式

```
📅 每週維護報告

━━ 專案健康 ━━
| 項目 | 狀態 | 詳情 |
|------|------|------|
| TypeScript | ✅ | 零錯誤 |
| 行數合規 | ✅ | 最大 245 行 |
| 殭屍進程 | ✅ | 無 |
| Secrets | ✅ | 無洩漏 |
| 超時保護 | ✅ | 0 個違規 |
| BAT 格式 | ✅ | 4/4 通過 |
| 依賴健康 | ⚠️ | 2 過期、0 漏洞 |

━━ Vault 狀態 ━━
| 項目 | 數值 |
|------|------|
| 總筆記 | 156 篇 |
| 分類數 | 12 個 |
| 7天新增 | 8 篇 |
| 空資料夾 | 0 個 |
| 可疑筆記 | 2 篇 |

━━ 需要行動 ━━
| 優先級 | 問題 | 修復 |
|--------|------|------|
| 🟡 中 | 2 篇可疑筆記 | 手動檢查 |

結論：✅ 專案健康，Vault 正常
```

---

## 與其他 Skill 的關係

| 發現問題 | 自動建議 |
|---------|---------|
| TS 編譯失敗 | 手動修復 → `/ship` |
| 行數超標 | `/refactor --modularize` |
| 缺少超時保護 | 手動加入 timeout |
| BAT 格式錯誤 | 手動修復 |
| Vault 分類異常 | `/vault maintain --reclassify` |
| Extractor 失效 | 更新 extractor |
| 搜尋引擎異常 | 更新 search-service |
| 依賴過期/漏洞 | `npm update --save` 後 `tsc --noEmit` |

---

## 建議執行頻率

| 頻率 | 指令 | 時機 |
|------|------|------|
| 每次 Session | `/resume` | 自動啟動 |
| 每週 | `/weekly` | 週末維護 |
| 每月 | `/weekly --full` | 全面檢查 |
