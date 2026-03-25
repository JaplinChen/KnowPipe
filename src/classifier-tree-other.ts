/** 非 AI 分類樹 */
import type { CategoryNode } from './classifier-categories.js';

export const NON_AI_TREE: CategoryNode[] = [
  // macOS 生態
  {
    name: 'macOS 生態',
    keywords: [
      'mac', 'macbook', 'iphone', 'ipad', 'macos', 'apple silicon',
      'apple watch', 'ios ', 'mac mini', 'mac studio', 'mac pro',
      'imac', 'orbstack', 'homebrew', 'amphetamine', '闔蓋不休眠',
      'mole', '清理工具', '磁盤清理', '系統優化', 'oneclip',
      '剪貼簿', 'syncthing', '檔案同步', 'recordly', '螢幕錄製',
    ],
    children: [
      {
        name: 'oMLX',
        keywords: [
          'omlx', 'omlx-', 'mlx',
          'apple neural engine', 'neural engine', 'rustane',
          '本地推理', 'local inference', '本地模型', 'local model',
          '本地 llm', '本地llm',
        ],
      },
    ],
  },

  // 知識管理（含 4 個子分類）
  {
    name: '知識管理',
    keywords: [
      'obsidian', 'pkm', '筆記軟體', '笔记软件',
      '筆記工具', '笔记工具', '知識管理',
    ],
    children: [
      {
        name: '筆記方法論',
        keywords: [
          'zettelkasten', '卡片盒', 'evergreen note',
          '漸進式總結', 'progressive summarization',
          'hq&a', '費曼', '間隔重複',
          'moc', 'map of content',
        ],
      },
      {
        name: 'Obsidian 插件',
        keywords: [
          'dataview', 'breadcrumbs', 'excalidraw',
          'note refactor', 'web clipper', 'obsidian git',
          '圖床', 'github cloudflare',
        ],
      },
      {
        name: 'Obsidian 設定',
        keywords: [
          '設定', '介面', '外觀', '快捷鍵', '主題',
          '手機app', 'icloud', 'workspaces', '初學',
          '基礎介面', '配置', '個人化', '番茄鐘',
        ],
      },
      {
        name: 'Obsidian 工作流',
        keywords: [
          'metadata', '模板', '雙向連結', '雙向鏈結',
          '知識網路', '知識網絡', '知識圖譜',
          '筆記系統', '寫作流程', '多來源',
          '四色', '內部連結', '第二大腦', '第二大脑',
          '知識工作', '輸入處理', '整合',
        ],
      },
    ],
  },

  // 軟體開發
  {
    name: '軟體開發',
    keywords: [
      'programming', 'javascript', 'typescript', 'python', 'rust',
      'react', 'nextjs', '程式設計', 'backend', 'frontend',
      'database', '健康檢查', 'heartbeat', 'health check',
      'c#', '.net', 'golang', 'swift', 'kotlin', 'docker',
      'worklenz', '專案管理',
    ],
  },

  // 商業 & 趨勢
  {
    name: '商業 & 趨勢',
    keywords: [
      'startup', 'founder', 'vc', 'venture', 'saas', 'product',
      'revenue', 'mrr', 'arr', 'b2b', '創業', '創辦人', '商業',
      '商業模式', 'business', 'entrepreneur', '產品',
      'stock', 'etf', 'crypto', 'bitcoin', 'invest', 'portfolio',
      'dividend', '股票', '基金', '投資', '理財', '加密貨幣',
      'marketing', 'seo', 'google ads', 'growth hack',
      '行銷', '廣告', '流量', 'viral',
      'news', 'breaking', '新聞', '時事', '政策', '國際',
    ],
  },

  // 中文媒體
  {
    name: '中文媒體',
    keywords: [
      '微博', 'weibo', '小紅書', '小红书', 'xiaohongshu',
      'bilibili', 'b站', '嗶哩嗶哩', '哔哩哔哩',
      '抖音', 'douyin', 'tiktok', '知乎', 'zhihu',
      '微信', 'wechat', '公眾號',
    ],
  },

  // 生活
  {
    name: '生活',
    keywords: [
      'food', 'travel', 'health', 'fitness', 'workout', 'recipe',
      'book review', 'movie', '飲食', '旅遊', '健康', '運動',
      '閱讀', '電影', 'lifestyle',
    ],
  },
];
