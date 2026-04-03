/**
 * sync-context — 自動同步 CLAUDE.md 的專案狀態區段。
 * 掃描程式碼庫，生成提取器/指令/功能開關等即時資訊。
 *
 * 用法：npx tsx scripts/sync-context.ts
 *
 * 安全保證：只修改標記區段內的內容，不觸碰手動維護的部分。
 * 也可匯出 oMLX system prompt 和 .cursorrules 格式。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getManifest, toCLAUDE, toSystemPrompt, toCursorRules } from '../src/utils/context-manifest.js';

const START_MARKER = '<!-- AUTO-GENERATED-START — 由 scripts/sync-context.ts 自動產生，請勿手動編輯此區段 -->';
const END_MARKER = '<!-- AUTO-GENERATED-END -->';

const ROOT = process.cwd();
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');

async function syncClaudeMd(manifest: Awaited<ReturnType<typeof getManifest>>): Promise<void> {
  const autoSection = toCLAUDE(manifest);
  let content: string;

  try {
    content = await readFile(CLAUDE_MD_PATH, 'utf-8');
  } catch {
    console.error('❌ 找不到 CLAUDE.md');
    process.exit(1);
  }

  const block = `${START_MARKER}\n${autoSection}\n${END_MARKER}`;
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + block + content.slice(endIdx + END_MARKER.length);
  } else {
    content += '\n\n' + block + '\n';
  }

  await writeFile(CLAUDE_MD_PATH, content, 'utf-8');
  console.log(`✅ CLAUDE.md 已同步（${manifest.extractors.count} 提取器, ${manifest.commands.count} 指令）`);
}

async function main(): Promise<void> {
  const manifest = await getManifest();
  const mode = process.argv[2];

  if (mode === '--system-prompt') {
    console.log(toSystemPrompt(manifest));
    return;
  }

  if (mode === '--cursorrules') {
    const cursorPath = join(ROOT, '.cursorrules');
    await writeFile(cursorPath, toCursorRules(manifest), 'utf-8');
    console.log(`✅ .cursorrules 已生成`);
    return;
  }

  if (mode === '--all') {
    await syncClaudeMd(manifest);
    const cursorPath = join(ROOT, '.cursorrules');
    await writeFile(cursorPath, toCursorRules(manifest), 'utf-8');
    console.log(`✅ .cursorrules 已生成`);
    console.log(`\n📋 System Prompt:\n${toSystemPrompt(manifest)}`);
    return;
  }

  // Default: sync CLAUDE.md only
  await syncClaudeMd(manifest);
}

main().catch((err) => {
  console.error('❌ 同步失敗:', err);
  process.exit(1);
});
