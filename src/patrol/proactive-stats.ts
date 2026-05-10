/**
 * 主動採集比例統計 — 掃描 Vault 筆記的 frontmatter，
 * 比較 bot-discovered 標籤與總筆記數，計算 Bot 自主值班效率。
 */
import { readFile } from 'node:fs/promises';
import { getAllMdFiles } from '../vault/frontmatter-utils.js';

export interface ProactiveStats {
  totalNotes: number;
  botDiscovered: number;
  userSubmitted: number;
  proactiveRatio: number;
  last30Days: { total: number; botDiscovered: number; ratio: number };
}

const BOT_TAG_RE = /\bbot-discovered\b/;
const DATE_RE = /^date:\s*(\d{4}-\d{2}-\d{2})/m;

function isRecent(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  const cutoff = Date.now() - days * 86_400_000;
  return new Date(dateStr).getTime() >= cutoff;
}

export async function computeProactiveStats(vaultPath: string): Promise<ProactiveStats> {
  const files = await getAllMdFiles(vaultPath);

  let total = 0;
  let bot = 0;
  let recent30Total = 0;
  let recent30Bot = 0;

  for (const f of files) {
    let raw: string;
    try {
      raw = await readFile(f, 'utf-8');
    } catch {
      continue;
    }
    // Only look inside frontmatter (first 600 chars to keep it fast)
    const front = raw.slice(0, 600);
    if (!front.startsWith('---')) continue;
    total++;

    const isBot = BOT_TAG_RE.test(front);
    if (isBot) bot++;

    const dateMatch = DATE_RE.exec(front);
    if (dateMatch && isRecent(dateMatch[1]!, 30)) {
      recent30Total++;
      if (isBot) recent30Bot++;
    }
  }

  return {
    totalNotes: total,
    botDiscovered: bot,
    userSubmitted: total - bot,
    proactiveRatio: total > 0 ? bot / total : 0,
    last30Days: {
      total: recent30Total,
      botDiscovered: recent30Bot,
      ratio: recent30Total > 0 ? recent30Bot / recent30Total : 0,
    },
  };
}

export function formatProactiveStats(s: ProactiveStats): string {
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const bar = (r: number, len = 20) => {
    const filled = Math.round(r * len);
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  };

  const lines = [
    '🤖 Bot 主動值班效率報告',
    '',
    '▸ 全體筆記',
    `  總計：${s.totalNotes} 篇`,
    `  Bot 主動發現：${s.botDiscovered} 篇 (${pct(s.proactiveRatio)})`,
    `  用戶手動送入：${s.userSubmitted} 篇`,
    `  ${bar(s.proactiveRatio)} ${pct(s.proactiveRatio)}`,
    '',
    '▸ 最近 30 天',
    `  總計：${s.last30Days.total} 篇`,
    `  Bot 主動發現：${s.last30Days.botDiscovered} 篇 (${pct(s.last30Days.ratio)})`,
    `  ${bar(s.last30Days.ratio)} ${pct(s.last30Days.ratio)}`,
    '',
  ];

  if (s.last30Days.ratio < 0.2) {
    lines.push('📉 主動率偏低——Bot 大多在等你送 URL，試試 /patrol 或調整 /radar 關鍵字。');
  } else if (s.last30Days.ratio < 0.5) {
    lines.push('🔄 主動率中等——Bot 已在值班，但仍有提升空間。');
  } else {
    lines.push('✅ 主動率良好——Bot 正在替你值班！繼續保持。');
  }

  lines.push('', '提示：新存入的筆記需啟用 /patrol 或 /radar 後才會計入主動值班數。');
  return lines.join('\n');
}
