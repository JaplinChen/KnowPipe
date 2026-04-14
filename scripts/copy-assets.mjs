/**
 * 複製非 TypeScript 靜態資源（HTML、JSON）從 src/ 到 dist/。
 * 由 npm run build 在 tsc 完成後呼叫。
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const ASSETS = [
  ['src/research/research-ui.html', 'dist/research/research-ui.html'],
  ['src/admin/ui.html', 'dist/admin/ui.html'],
  ['src/admin/locales/en.json', 'dist/admin/locales/en.json'],
  ['src/admin/locales/zh-TW.json', 'dist/admin/locales/zh-TW.json'],
  ['src/admin/locales/vi.json', 'dist/admin/locales/vi.json'],
];

for (const [src, dest] of ASSETS) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`copied: ${src} → ${dest}`);
}
