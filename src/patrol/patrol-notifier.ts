/**
 * Format patrol results for Telegram notification with inline save buttons.
 * Reuses discover-command's token cache for button callbacks.
 */
import type { PatrolItem } from './sources/source-types.js';
import { rememberUrl } from '../commands/discover-command.js';
import { isDuplicateUrl } from '../saver.js';
import { Markup } from 'telegraf';

const SOURCE_LABELS: Record<string, string> = {
  'hn': '🔶 HN',
  'devto': '📝 Dev.to',
  'github-trending': '🐙 GitHub',
};

function truncTitle(title: string, max = 40): string {
  return title.length > max ? title.slice(0, max - 1) + '…' : title;
}

/** Filter out items already saved in Vault. */
export async function filterUnsaved(
  items: PatrolItem[], vaultPath: string,
): Promise<PatrolItem[]> {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const dup = await isDuplicateUrl(item.url, vaultPath);
      return dup ? null : item;
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<PatrolItem | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is PatrolItem => v !== null);
}

/** Build Telegram message text for patrol results, grouped by source. */
export function formatPatrolNotification(items: PatrolItem[]): string {
  if (items.length === 0) return '🔭 巡邏完成，無新內容';

  const grouped = new Map<string, PatrolItem[]>();
  for (const item of items) {
    const list = grouped.get(item.source) ?? [];
    list.push(item);
    grouped.set(item.source, list);
  }

  const lines: string[] = ['🔭 多平臺巡邏結果', ''];

  for (const [source, sourceItems] of grouped) {
    const label = SOURCE_LABELS[source] ?? source;
    lines.push(`${label}（${sourceItems.length} 項）`);
    for (const item of sourceItems.slice(0, 5)) {
      const scoreTag = item.score ? ` ⬆${item.score}` : '';
      lines.push(`  🔹 ${truncTitle(item.title)}${scoreTag}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Build inline keyboard with save buttons for unsaved items. */
export function buildPatrolButtons(items: PatrolItem[]) {
  const buttons = items.slice(0, 8).map((item) => {
    const token = rememberUrl(item.url);
    const label = `📥 ${truncTitle(item.title, 30)}`;
    return [Markup.button.callback(label, `dsc:${token}`)];
  });
  return Markup.inlineKeyboard(buttons);
}
