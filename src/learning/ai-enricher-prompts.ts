/** Prompt builder helpers for ai-enricher.ts (extracted to stay under 300 lines). */

export function buildGithubPrompt(): string[] {
  return [
    '',
    '=== GitHub 項目專屬分析指令 ===',
    'JSON 需額外包含 githubAnalysis 欄位（字串，繁體中文，300-500字）。',
    'githubAnalysis 必須包含以下結構（用 markdown 格式）：',
    '### 項目用途',
    '一段話說明這個項目解決什麼問題、目標使用者是誰。',
    '### 技術棧與架構',
    '列出主要技術、框架、語言，說明架構特色。',
    '### 核心功能',
    '3-5 條最重要的功能，每條一句話。',
    '### 同類工具對比',
    '列出 2-3 個替代方案，各用一句話說明差異。',
    '格式：「vs {工具名}：{差異描述}」',
    '### 適合場景',
    '說明最適合哪類開發者或使用場景，以及不適合的場景。',
    '### 優缺點',
    '各列 2-3 條具體優缺點。',
    '',
    '注意：githubAnalysis 的所有內容必須基於 README 和項目描述推斷，不可臆造。',
    '如果 README 資訊不足以推斷某個部分，明確標注「資訊不足」。',
  ];
}

export function buildChapterPrompt(timedTranscriptText: string): string[] {
  return [
    '',
    '=== 影片章節分析指令 ===',
    '以下提供了帶時間戳的轉錄文字。請根據語義轉折點識別章節邊界。',
    'JSON 需額外包含 chapters 欄位（陣列），每個元素包含：',
    '  startTime: "MM:SS" 或 "HH:MM:SS" 格式的開始時間',
    '  title: 章節標題（繁體中文，≤20字）',
    '  summary: 一句話摘要（繁體中文，≤40字）',
    '章節數量 3-8 個，根據內容豐富度決定。',
    '時間戳必須對應轉錄文字中出現的時間點。',
    '',
    `[帶時間戳的轉錄文字]\n${timedTranscriptText}`,
  ];
}

export function buildLinkedContentPrompt(): string[] {
  return [
    '',
    '=== 連結文章分析指令 ===',
    '內容中包含 [連結文章內容] 標記的部分是主文中連結到的外部文章。',
    '分析時必須綜合主文與連結文章，重點提取連結文章的核心觀點、技術細節和實用資訊。',
    'summary 和 analysis 應反映連結文章的深度內容，而非僅複述主文的表面列舉。',
    'keyPoints 應從連結文章中提取最有價值的具體做法或結論。',
  ];
}

export function buildPredictionPrompt(): string[] {
  return [
    '',
    '=== 可驗證預測指令 ===',
    'predictions: 陣列，最多 2 個可測試預測（若內容無明確趨勢信號則省略此欄位）。',
    '每個元素：{"text": "具體預測（繁體中文，≤30字）", "confidence": 0.5-0.85, "deadline": "YYYY-MM-DD"}',
    '範例：{"text": "本地端 LLM 推理將在 2026 下半年成為開源主流", "confidence": 0.7, "deadline": "2026-12-31"}',
    '- confidence: 基於文中的證據強度，0.5=不確定, 0.85=有充分依據',
    '- deadline: 合理驗證時間點（3-12 個月後）',
    '- 不可臆造、不可生成無法驗證的模糊預測（如「AI 將更重要」）',
  ];
}
