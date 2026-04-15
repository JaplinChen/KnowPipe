/**
 * AI 筆記對話服務 — 支援分析與上下文感知問答。
 * LLM 呼叫全部走 runLocalLlmPrompt()。
 */
import { runLocalLlmPrompt } from '../utils/local-llm.js';
import { buildNoteContext } from './vault-reader.js';
import type { NoteRecord, ChatMessage, AnalysisOverview } from './types.js';

/* ── 工具函式 ────────────────────────────────────────────────── */

/** 移除 LLM 輸出中的 <thinking>/<think> 區塊。 */
function stripThinkingTags(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

/** 從 LLM 回覆中提取 JSON。 */
function extractJson<T>(text: string): T | null {
  const cleaned = stripThinkingTags(text);

  // 嘗試 fenced JSON
  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]) as T; } catch { /* fall through */ }
  }

  // 嘗試裸 JSON
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    try { return JSON.parse(cleaned.slice(braceStart, braceEnd + 1)) as T; } catch { /* fall through */ }
  }

  return null;
}

/* ── 公開 API ────────────────────────────────────────────────── */

/**
 * 分析所選筆記，產生摘要、關鍵問題、核心概念。
 */
export async function analyzeNotes(
  topic: string,
  notes: NoteRecord[],
): Promise<AnalysisOverview | null> {
  // 取前 6 篇筆記的摘要，每篇最多 300 字
  const noteSnippets = notes.slice(0, 6).map((n) => {
    const content = (n.body || n.preview || '').slice(0, 300);
    return `【${n.name}】${content}`;
  }).join('\n---\n') || '無';

  const prompt = `針對「${topic}」，基於以下筆記內容：\n${noteSnippets}\n\n只回傳純 JSON（不含其他文字）：\n`
    + '{"summary":"摘要100字以內","keyQuestions":["Q1","Q2","Q3","Q4","Q5"],'
    + '"keyConcepts":["概念1","概念2","概念3","概念4","概念5"]}';

  const result = await runLocalLlmPrompt(prompt, {
    task: 'analyze',
    maxTokens: 1024,
    timeoutMs: 60_000,
  });

  if (!result) return null;
  return extractJson<AnalysisOverview>(result);
}

/**
 * 以筆記為上下文進行對話，回傳助手回覆。
 * 支援 wikilink [[筆記名稱]] 歸因。
 */
export async function chatWithNotes(
  topic: string,
  notes: NoteRecord[],
  history: ChatMessage[],
  userMessage: string,
): Promise<string> {
  const systemPrompt = buildNoteContext(notes, topic);

  // 組裝對話歷史為單一 prompt（因 runLocalLlmPrompt 只接受單一 prompt）
  const historyText = history
    .filter((m) => m.content)
    .map((m) => `${m.role === 'user' ? '使用者' : '助手'}：${m.content}`)
    .join('\n\n');

  const fullPrompt = [
    systemPrompt,
    historyText ? `\n\n對話歷史：\n${historyText}` : '',
    `\n\n使用者：${userMessage}`,
    '\n\n助手：',
  ].join('');

  const result = await runLocalLlmPrompt(fullPrompt, {
    task: 'analyze',
    maxTokens: 2048,
    timeoutMs: 90_000,
  });

  if (!result) return '（LLM 無回應，請稍後再試）';
  return stripThinkingTags(result);
}

/**
 * 產生研究報告 — 結構化的深度分析。
 */
export async function generateResearchReport(
  topic: string,
  notes: NoteRecord[],
): Promise<string> {
  const context = buildNoteContext(notes, topic);
  const prompt = `${context}\n\n`
    + `請針對「${topic}」撰寫一份結構化研究報告，包含：\n`
    + '1. ## 摘要（100-150字概述）\n'
    + '2. ## 背景（為何這個主題重要）\n'
    + '3. ## 核心發現（3-5 個重點，每個用 ### 子標題）\n'
    + '4. ## 分析與洞察（跨筆記的整合觀點）\n'
    + '5. ## 結論與建議\n\n'
    + '引用筆記時用 [[筆記名稱]] 標注。用繁體中文。';

  const result = await runLocalLlmPrompt(prompt, {
    task: 'analyze',
    model: 'deep',
    maxTokens: 3072,
    timeoutMs: 120_000,
  });

  return result ? stripThinkingTags(result) : '（報告生成失敗）';
}

/**
 * 產生比較表 — 多筆記的對比分析。
 */
export async function generateComparisonTable(
  topic: string,
  notes: NoteRecord[],
): Promise<string> {
  const context = buildNoteContext(notes, topic);
  const prompt = `${context}\n\n`
    + `請針對「${topic}」建立一個比較表，比較上述筆記中提到的主要概念/工具/方法。\n`
    + '輸出格式為 Markdown 表格，至少 3 個比較維度。\n'
    + '表格後附上簡短的比較分析（100-200字）。用繁體中文。';

  const result = await runLocalLlmPrompt(prompt, {
    task: 'analyze',
    maxTokens: 2048,
    timeoutMs: 90_000,
  });

  return result ? stripThinkingTags(result) : '（比較表生成失敗）';
}

/**
 * 產生 Anki 閃卡 — 10 張問答卡片。
 */
export async function generateAnkiCards(
  topic: string,
  notes: NoteRecord[],
): Promise<string> {
  const context = buildNoteContext(notes, topic);
  const prompt = `${context}\n\n`
    + `請從「${topic}」相關內容中提取 10 個關鍵知識點，產生 Anki 閃卡。\n`
    + '格式：每張卡片用 ### 分隔，包含「**問題：**」和「**答案：**」。\n'
    + '問題應測試理解而非記憶。用繁體中文。';

  const result = await runLocalLlmPrompt(prompt, {
    task: 'summarize',
    maxTokens: 2048,
    timeoutMs: 90_000,
  });

  return result ? stripThinkingTags(result) : '（閃卡生成失敗）';
}

/**
 * 產生教學大綱 — 課程結構。
 */
export async function generateTeachingOutline(
  topic: string,
  notes: NoteRecord[],
): Promise<string> {
  const context = buildNoteContext(notes, topic);
  const prompt = `${context}\n\n`
    + `請為「${topic}」設計一份教學大綱，包含：\n`
    + '1. ## 學習目標（3-5 個）\n'
    + '2. ## 課程章節（5-8 章，每章含 ### 標題、學習重點、關鍵概念）\n'
    + '3. ## 延伸閱讀\n\n'
    + '引用筆記時用 [[筆記名稱]] 標注。用繁體中文。';

  const result = await runLocalLlmPrompt(prompt, {
    task: 'analyze',
    model: 'deep',
    maxTokens: 3072,
    timeoutMs: 120_000,
  });

  return result ? stripThinkingTags(result) : '（教學大綱生成失敗）';
}

/**
 * 圖表類型定義。
 */
export type DiagramType = 'flowchart' | 'mindmap' | 'timeline' | 'sequence' | 'architecture';

const DIAGRAM_PROMPTS: Record<DiagramType, string> = {
  flowchart:
    '請用 Mermaid flowchart LR 語法，畫出「{topic}」的核心概念流程圖。\n'
    + '節點用中文標示，包含 5-10 個節點，清楚顯示因果/流程關係。\n'
    + '只輸出 ```mermaid 代碼塊，不加其他文字。',
  mindmap:
    '請用 Mermaid mindmap 語法，畫出「{topic}」的心智圖。\n'
    + '根節點為主題，展開 3-4 層，中文標示。\n'
    + '只輸出 ```mermaid 代碼塊，不加其他文字。',
  timeline:
    '請用 Mermaid timeline 語法，畫出「{topic}」的時間軸或發展歷程。\n'
    + '如果沒有明確時間點，用邏輯順序的階段取代（如「第一階段」「第二階段」）。\n'
    + '中文標示。只輸出 ```mermaid 代碼塊，不加其他文字。',
  sequence:
    '請用 Mermaid sequenceDiagram 語法，畫出「{topic}」的互動時序圖。\n'
    + '顯示主要參與者之間的訊息流。中文標示。\n'
    + '只輸出 ```mermaid 代碼塊，不加其他文字。',
  architecture:
    '請為「{topic}」生成一個專業深色主題的 SVG 系統架構圖。\n\n'
    + '只輸出 ```svg 代碼塊，不含其他任何文字。\n\n'
    + '**⚠️ 版面規劃（先做這步，不可跳過）：**\n'
    + '1. 決定元件數量：最多 8 個（太多會重疊，請合併次要元件）\n'
    + '2. 決定列數：建議 2-3 欄，每欄最多 3 個元件（垂直）\n'
    + '3. 計算總高度：最後一列 y + 60（框高）+ 40（底部留白）\n'
    + '   → 2 列（最後 y=180）：高度 280  → 3 列（最後 y=310）：高度 410  → 4 列（最後 y=440）：高度 540\n'
    + '4. 設定 viewBox="0 0 900 {計算出的高度}"，<svg> 的 height 屬性同步更新\n'
    + '5. 元件 y 座標：第1列 y=50, 第2列 y=180, 第3列 y=310, 第4列 y=440\n'
    + '6. 每個元件高度固定 60px，同列元件頂齊\n\n'
    + '❌ 禁止：把 3+ 個元件垂直堆疊在 560px 內（間距 < 80px 必然重疊）\n'
    + '✅ 正確：3 欄 × 2 列 = 6 個元件，viewBox height=260，輕鬆放下\n\n'
    + '**SVG 規範：**\n'
    + '字體：font-family="\'PingFang TC\',\'Microsoft JhengHei\',sans-serif"\n'
    + '主標籤：fill="#e2e8f0" font-size="13"；副標籤：fill="#94a3b8" font-size="11"\n\n'
    + '**元件顏色（依類型）：**\n'
    + '前端/UI：stroke="#22d3ee" fill="rgba(8,51,68,0.5)"\n'
    + '後端/API/服務：stroke="#34d399" fill="rgba(6,78,59,0.5)"\n'
    + '資料庫/儲存：stroke="#a78bfa" fill="rgba(76,29,149,0.5)"\n'
    + '雲端/基礎設施：stroke="#fbbf24" fill="rgba(120,53,15,0.4)"\n'
    + '安全/認證：stroke="#fb7185" fill="rgba(136,19,55,0.5)"\n'
    + '訊息佇列：stroke="#fb923c" fill="rgba(251,146,60,0.4)"\n\n'
    + '**繪製順序（z-order 關鍵）：**\n'
    + '1. 背景（fill="#020617"）+ 網格（間距40px，stroke="#1e293b" stroke-width="0.5"）\n'
    + '2. 分組邊界框（虛線，stroke-dasharray="6,3" stroke="#334155" fill="none" rx="12"）\n'
    + '3. 箭頭/連線（先畫）：<line> 或 <path>，stroke="#4b5563" stroke-width="1.5"，端點加箭頭\n'
    + '4. 元件遮罩（fill="#0f172a"，與元件框相同大小，無邊框）\n'
    + '5. 元件框（半透明 RGBA fill，彩色 stroke，rx="8" stroke-width="1.5"）\n'
    + '6. 文字標籤（見下方規則）\n\n'
    + '**⚠️ 文字 y 座標查表（禁止自行推算，直接抄下表）：**\n'
    + '所有元件框高固定 60px。依元件框的 y 值查表：\n\n'
    + '| 框 y | 一行主標籤 y | 兩行：主標籤 y | 兩行：副標籤 y |\n'
    + '|------|------------|--------------|---------------|\n'
    + '| 50   | 87         | 75           | 97            |\n'
    + '| 180  | 217        | 205          | 227           |\n'
    + '| 310  | 347        | 335          | 357           |\n'
    + '| 440  | 477        | 465          | 487           |\n\n'
    + '主標籤 font-size="13" fill="#e2e8f0"\n'
    + '副標籤 font-size="11" fill="#94a3b8"\n'
    + '禁用 dominant-baseline，禁止自行計算 y 值（只能用上表）\n'
    + '文字超過 7 字請截短，確保不超出框寬。\n\n'
    + '箭頭用 <defs><marker> 定義，id="arrowhead"，fill="#4b5563"\n'
    + '在箭頭旁加協議標籤（REST/SQL/gRPC 等），font-size="10" fill="#64748b"',
};

/**
 * 自動生成 Mermaid 圖表。
 */
export async function generateDiagram(
  type: DiagramType,
  topic: string,
  notes: NoteRecord[],
): Promise<string> {
  const context = buildNoteContext(notes, topic);
  const templatePrompt = DIAGRAM_PROMPTS[type] ?? DIAGRAM_PROMPTS.flowchart;
  const taskPrompt = templatePrompt.replace('{topic}', topic);
  const prompt = `${context}\n\n${taskPrompt}`;

  const isArchitecture = type === 'architecture';
  const result = await runLocalLlmPrompt(prompt, {
    task: 'summarize',
    maxTokens: isArchitecture ? 3072 : 1024,
    timeoutMs: isArchitecture ? 120_000 : 60_000,
  });

  if (!result) return '（圖表生成失敗，請稍後再試）';
  const cleaned = stripThinkingTags(result);

  // SVG 架構圖 — 確保包含 ```svg 代碼塊
  if (isArchitecture) {
    if (cleaned.includes('```svg')) return cleaned;
    // 裸 SVG 輸出時自動包裝
    if (cleaned.trimStart().startsWith('<svg')) {
      return '```svg\n' + cleaned.trim() + '\n```';
    }
    return cleaned;
  }

  // Mermaid 圖表 — 確保包含 ```mermaid 代碼塊
  if (cleaned.includes('```mermaid')) return cleaned;
  const mermaidKeywords = ['graph ', 'flowchart ', 'sequenceDiagram', 'mindmap', 'timeline', 'classDiagram', 'gantt'];
  if (mermaidKeywords.some(k => cleaned.includes(k))) {
    return '```mermaid\n' + cleaned.trim() + '\n```';
  }

  return cleaned;
}
