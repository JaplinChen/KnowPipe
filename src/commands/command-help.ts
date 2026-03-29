import type { Context } from 'telegraf';
import { Markup } from 'telegraf';

export const HELP_TEXT = [
  'ObsBot — 傳送連結即可自動儲存',
  'X / Threads / Reddit / YouTube / GitHub',
  '微博 / B站 / 小紅書 / 抖音 / 任何網頁',
  '',
  '核心指令：',
  '/search — 搜尋（Vault/網頁/提及/影片）',
  '/ask — 用知識庫回答問題',
  '/explore — 知識探索',
  '/discover — GitHub 專案探索',
  '/radar — 內容雷達',
  '',
  '點擊下方查看更多，或 /help all 完整列表',
].join('\n');

export const HELP_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback('📥 搜尋與收集', 'help:content'), Markup.button.callback('🧠 知識系統', 'help:knowledge')],
  [Markup.button.callback('🔧 Vault 維護', 'help:vault'), Markup.button.callback('⚙️ 系統管理', 'help:system')],
]);

export const HELP_CATEGORIES: Record<string, string> = {
  content: [
    '📥 搜尋與收集',
    '',
    '/search — 統一搜尋入口',
    '  /search vault <關鍵字> — Vault 筆記',
    '  /search web <查詢> — 網頁搜尋',
    '  /search monitor <關鍵字> — 跨平台提及',
    '  /search video <關鍵字> — 影片筆記',
    '',
    '/discover <關鍵字> — GitHub 專案探索',
    '/radar — 內容雷達（自動搜尋+存入）',
    '',
    '/track — 追蹤與訂閱',
    '  /track timeline @用戶 — 抓取最近貼文',
    '  /track subscribe — 訂閱管理',
    '  /track patrol — 多平台巡邏',
  ].join('\n'),
  knowledge: [
    '🧠 知識系統',
    '',
    '/ask <問題> — 用知識庫回答問題',
    '/knowledge — 知識庫總覽（gaps/skills/analyze）',
    '/explore <主題> — 知識探索（推薦/簡報/深度合成）',
    '/explore <A> vs <B> — 主題對比分析',
    '/digest — 知識報告（精華/週報/蒸餾/整合）',
  ].join('\n'),
  vault: [
    '🔧 Vault 維護',
    '',
    '/vault — 統一維護入口',
    '  /vault quality — 品質報告',
    '  /vault dedup — 掃描重複筆記',
    '  /vault reprocess <路徑> — 重新 AI 豐富',
    '  /vault reformat — 修復排版',
    '  /vault benchmark — 品質基準報告',
    '  /vault retry — 重試失敗連結',
    '  /vault suggest — 推薦相關筆記連結',
  ].join('\n'),
  system: [
    '⚙️ 系統管理',
    '',
    '/admin — 統一管理入口',
    '  /admin status — Bot 狀態',
    '  /admin health — 健康檢查',
    '  /admin doctor — 全面診斷',
    '  /admin logs [n] — 查看日誌',
    '  /admin restart — 重啟 Bot',
    '  /admin code <action> — 遠端指令',
    '  /admin clear — 清除統計',
    '  /admin learn — Vault 學習',
  ].join('\n'),
};

export async function handleHelpCategory(ctx: Context & { match: RegExpExecArray }): Promise<void> {
  const cat = ctx.match[1];
  await ctx.answerCbQuery().catch(() => {});
  const text = HELP_CATEGORIES[cat];
  if (text) await ctx.reply(text);
}

export const HELP_ALL_TEXT = [
  'ObsBot 完整指令列表',
  '',
  '📥 搜尋與收集',
  '/search [vault|web|monitor|video] <查詢> — 統一搜尋',
  '/discover <關鍵字> — GitHub 專案探索',
  '/radar — 內容雷達',
  '/track [timeline|subscribe|patrol] — 追蹤與訂閱',
  '',
  '🧠 知識系統',
  '/ask <問題> — 知識庫問答',
  '/knowledge [gaps|skills|analyze] — 知識庫總覽',
  '/explore <主題> | <A> vs <B> — 知識探索',
  '/digest [weekly|distill] — 知識報告',
  '',
  '🔧 Vault 維護',
  '/vault [quality|dedup|reprocess|reformat|benchmark|retry|suggest]',
  '',
  '⚙️ 系統管理',
  '/admin [status|health|doctor|logs|restart|code|clear|learn]',
  '',
  '所有舊指令（/find /monitor /status 等）仍可直接使用',
].join('\n');

/** Telegram menu — only 10 core commands */
export const BOT_COMMANDS_MENU = [
  { command: 'search', description: '搜尋（Vault/網頁/提及/影片）' },
  { command: 'ask', description: '用知識庫回答問題' },
  { command: 'explore', description: '知識探索（推薦/簡報/深度合成）' },
  { command: 'digest', description: '知識報告（精華/週報/蒸餾）' },
  { command: 'discover', description: 'GitHub 專案探索' },
  { command: 'radar', description: '內容雷達（自動搜尋+存入）' },
  { command: 'track', description: '追蹤（時間軸/訂閱/巡邏）' },
  { command: 'vault', description: 'Vault 維護（品質/重複/重處理）' },
  { command: 'admin', description: '系統管理（狀態/診斷/重啟）' },
  { command: 'help', description: '顯示說明' },
];
