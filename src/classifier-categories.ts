/** 分類規則資料 — 以 Vault 資料夾結構為唯一真相源 */

export interface CategoryRule {
  name: string;
  keywords: string[];
  exclude?: string[];  // 命中任一排除詞則跳過此分類
}

export const CATEGORIES: CategoryRule[] = [
  // AI 三層：具體工具 → 功能兜底 → AI 通用兜底（越精確排越前）

  // ── 具體工具/平台 ──
  {
    name: 'AI/Agent 工程/桌面 Agent/Cowork',
    keywords: ['claude cowork', 'cowork'],
    exclude: [
      'sword', 'antique', '古劍', '金屬', 'jewelry',
      'staffing', 'employer', 'recruitment', '人力',
      'john mayer', 'johnmayer', 'rakuten', 'reddit.com', 'r/',
    ],
  },
  {
    name: 'AI/Agent 工程/桌面 Agent/OpenWork',
    keywords: ['openwork'],
  },

  // Agent 工程：具體平台
  {
    name: 'AI/Agent 工程/Claude Code',
    keywords: ['claude code', 'claude-code', 'anthropic', 'claude sdk', 'agent-sdk', 'claude.md'],
  },
  {
    name: 'AI/Agent 工程/OpenClaw',
    keywords: [
      'openclaw', 'open claw', 'openclaws', 'clawbot', '龍蝦', '龙虾',
      'nanoclaw', 'opencloy', 'u-claw', 'clawhub', '養蝦', '小龍蝦',
    ],
  },

  // LLM 基礎：具體模型
  {
    name: 'AI/LLM 基礎/Claude',
    keywords: ['claude', 'claude 3', 'claude 4'],
  },
  {
    name: 'AI/LLM 基礎/OpenAI',
    keywords: ['chatgpt', 'openai', 'codex', 'openai codex', 'gpt-5', 'gpt-4o', 'o1', 'o3'],
  },
  {
    name: 'AI/LLM 基礎/Gemini',
    keywords: ['gemini', 'notebooklm', 'notebook lm', 'google ai'],
  },
  {
    name: 'AI/LLM 基礎/DeepSeek',
    keywords: ['deepseek'],
  },
  {
    name: 'AI/LLM 基礎/開源模型',
    keywords: ['llama', 'mistral', 'qwen', 'gemma', 'phi-'],
  },

  // 開發工具：具體工具
  { name: 'AI/開發工具/終端/Ghostty', keywords: ['ghostty'] },
  { name: 'AI/開發工具/CLI/OpenCLI', keywords: ['opencli'] },

  // 多模態生成：具體工具名
  { name: 'AI/多模態生成/圖像', keywords: ['midjourney', 'dall-e', 'dalle', 'flux', 'stable diffusion', 'stablediffusion'] },
  { name: 'AI/多模態生成/影片', keywords: ['sora', 'runway', 'kling', 'pika', 'heygen', 'luma'] },

  // 自動化：具體工具名
  { name: 'AI/自動化', keywords: ['cursor', 'windsurf', 'cline', 'n8n', 'zapier'] },

  // ── AI 功能兜底 ──
  {
    name: 'AI/Agent 工程',
    keywords: [
      'ai agent', 'agentic', 'agent工程', 'agent engineer',
      'multi-agent', 'agent orchestration', 'agent 軍團', 'agent 架構',
      'agent framework', 'agent monitoring', 'agent 操控', 'agent 監控',
      '桌面代理', 'desktop agent', '桌面自動化', 'computer use',
    ],
  },
  {
    name: 'AI/LLM 基礎',
    keywords: [
      '大模型', '大語言模型', '大语言模型', '模型评测', '模型評測',
      'benchmark', 'leaderboard', 'minimax',
      '免费 claude', '免費 claude',
    ],
  },
  {
    name: 'AI/Prompt 工程',
    keywords: [
      'prompt engineering', 'system prompt', '提示词', '提示詞',
      '调教', '調教', '角色扮演', 'role play', 'jailbreak',
      'few-shot', 'zero-shot', 'chain of thought',
      '寫作', 'writing assist', '優化技巧', '細節優化', '生成技巧',
    ],
  },
  {
    name: 'AI/RAG & 知識圖譜',
    keywords: [
      'rag', 'retrieval', 'vector database', 'embedding',
      'graphrag', '知識圖譜', '檢索增強', 'knowledge graph',
      'langchain', 'langgraph',
    ],
  },
  {
    name: 'AI/多模態生成/圖像',
    keywords: [
      'image generat', '圖片生成', '圖像生成', '圖片放大', 'image enhance',
      'comfyui', '放大', 'text to image', '文生圖',
      '3d model', '3d模型', '圖片轉3d', 'trellis',
    ],
  },
  {
    name: 'AI/多模態生成/影片',
    keywords: [
      'video generat', '影片生成', '影片製作', '視頻生成', '视频生成',
      'text to video', '文生影片', '文生視頻',
      '字幕', 'caption', 'subtitle', '影片編輯', 'video edit',
      'ffmpeg', '短影音', '剪輯',
    ],
  },
  {
    name: 'AI/多模態生成/語音',
    keywords: [
      'whisper', 'tts', 'text to speech', 'speech to text',
      '語音合成', '語音辨識', '語音識別', '語音轉文字',
      'voice mode', '語音模式',
    ],
  },
  {
    name: 'AI/部署 & 推理',
    keywords: [
      'api gateway', '中轉', '中轉站', '部署', 'inference',
      'vllm', 'ollama', 'api proxy', 'sub2api',
      '私有化', '模型部署', '推理引擎',
    ],
  },
  {
    name: 'AI/開發工具/爬蟲 & 擷取',
    keywords: [
      '爬蟲', 'crawler', 'scraping', 'scraper', 'firecrawl',
      '資料抓取', '数据抓取', 'readability', '網頁擷取', 'defuddle',
    ],
  },
  { name: 'AI/開發工具/終端', keywords: ['terminal emulator', '終端機', 'gpu加速終端'] },
  { name: 'AI/開發工具/CLI', keywords: ['cli tool', 'cli 工具', '命令列工具'] },
  { name: 'AI/開發工具', keywords: ['開發工具', 'dev tool', '無頭瀏覽器', 'headless browser'] },
  {
    name: 'AI/應用場景',
    keywords: [
      'mcp server', 'mcp tool', 'mcp ',
      'telegram bot', 'bot',
      '情報', '自動摘要', '自動化工作流',
      'best practices', '最佳实践', '最佳實踐', '工程指南',
    ],
  },
  { name: 'AI/辦公協作', keywords: ['辦公協作', '協作辦公', 'feishu', '飛書'] },
  { name: 'AI/自動化', keywords: ['自動化', 'automation', 'workflow'] },

  // ── AI 通用兜底 ──
  {
    name: 'AI/研究對話',
    keywords: [
      '完全教程', '教程', '小白', '新手',
      '入門指南', '入门指南', '入門教學', '入门教学',
      '从0开始', '从零开始', '零基礎', '零基础',
      'getting started', '手把手', '3分钟', '0代码',
    ],
  },
  {
    name: 'AI/研究對話',
    keywords: [
      'ai', 'gpt', 'llm', 'copilot', 'diffusion',
      '人工智慧', '機器學習', 'machine learning', 'deep learning',
    ],
  },

  // ── 非 AI 分類 ──
  {
    name: '知識管理/Obsidian 工作流',
    keywords: [
      'obsidian', '雙向連結', '雙向鏈結', '第二大腦', '第二大脑',
      '知識圖譜', '知識網路', '知識網絡', '知識管理',
    ],
  },
  {
    name: '知識管理/Obsidian 插件',
    keywords: [
      'obsidian 插件', 'obsidian plugin', 'dataview', 'breadcrumbs',
      'templater', 'obsidian community',
    ],
  },
  {
    name: '知識管理/Obsidian 設定',
    keywords: [
      'obsidian 設定', 'obsidian 配置', 'obsidian workspaces',
      'obsidian 快捷鍵', 'obsidian theme',
    ],
  },
  {
    name: '知識管理/筆記方法論',
    keywords: [
      'zettelkasten', 'evergreen note', '卡片盒', '卡片盒筆記法',
      '漸進式總結', 'progressive summarization', 'moc',
      '筆記法', '筆記方法', 'pkm',
    ],
  },
  {
    name: '生產力/Obsidian',
    keywords: [
      '筆記軟體', '笔记软件', '筆記工具', '笔记工具',
    ],
  },
  {
    name: 'macOS 生態/oMLX',
    keywords: ['omlx', 'apple neural engine', 'mlx', 'coreml'],
  },
  {
    name: 'macOS 生態',
    keywords: [
      'mac mini', 'mac studio', 'mac pro', 'imac', 'orbstack',
      'amphetamine', '行動伺服器', 'macwhisper',
    ],
  },
  {
    name: '科技/Apple',
    keywords: [
      'iphone', 'ipad', 'macos', 'apple silicon', 'apple watch',
      'ios ', 'macbook', 'apple', 'mac',
      '快捷指令', '捷徑',
    ],
  },
  {
    name: '軟體開發',
    keywords: [
      'programming', 'javascript', 'typescript', 'python', 'rust',
      'react', 'nextjs', '程式設計', 'backend', 'frontend', 'database',
      'heartbeat', 'health check', 'c#', '.net', 'golang', 'swift',
      'kotlin', 'docker',
    ],
  },
  {
    name: '投資理財',
    keywords: [
      'stock', 'etf', 'crypto', 'bitcoin', 'invest', 'portfolio',
      'dividend', '股票', '基金', '投資', '理財', '加密貨幣',
      '比特幣', '報酬', '資產', 'finance', 'market', '市場',
    ],
  },
  {
    name: '商業 & 趨勢',
    keywords: [
      'startup', 'founder', 'vc', 'venture', 'saas', 'product',
      'revenue', 'mrr', 'arr', 'b2b', '創業', '創辦人', '商業',
      '商業模式', 'business', 'entrepreneur', '產品',
    ],
  },
  {
    name: '中文媒體',
    keywords: [
      '微博', 'weibo', '小紅書', '小红书', 'xiaohongshu', '紅書', 'xhs',
      'bilibili', 'b站', '嗶哩嗶哩', '哔哩哔哩', '抖音', 'douyin',
      '今日頭條', '今日头条', 'toutiao', 'tiktok', '知乎', 'zhihu',
      '豆瓣', 'douban',
    ],
  },
  {
    name: '生產力',
    keywords: [
      'productivity', 'habit', 'focus', '生產力', '工作流',
      '效率', 'notion', 'syncthing', '檔案同步',
    ],
  },
  { name: '設計', keywords: ['typography', 'brand design', 'visual design', '排版', '品牌設計', '視覺設計'] },
  { name: '行銷', keywords: ['marketing', 'seo', 'google ads', 'growth hack', 'content marketing', '行銷', '廣告', '流量'] },
  { name: '新聞時事', keywords: ['news', 'breaking', 'election', 'government', 'policy', 'war', '新聞', '時事', '政策', '戰爭'] },
  {
    name: '生活',
    keywords: [
      'food', 'travel', 'health', 'fitness', 'workout', 'recipe',
      'book', 'movie', '飲食', '旅遊', '健康', '運動', '閱讀', '電影', '生活', 'lifestyle',
    ],
    exclude: [
      'github', 'cli', 'api', 'heartbeat', '健康檢查', 'health check',
      'docker', '開源', 'open source', 'sdk', 'npm', 'bot',
    ],
  },
];
