/**
 * 產生三種狀態的 tray 圖示（PNG 16x16）
 * 用法：node scripts/gen-icons.mjs
 * 依賴：無外部套件，純 Node.js
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');

// 最小 1x1 透明 PNG header（之後換成真正圖示）
// 這只是佔位符，正式版需換成真實 .icns / .ico
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const files = ['icon.png', 'icon-running.png', 'icon-stopped.png', 'icon-error.png'];
for (const f of files) {
  writeFileSync(join(ASSETS, f), PLACEHOLDER_PNG);
  console.log(`✓ ${f}`);
}
console.log('\n⚠️  圖示為佔位符，正式發布前請替換 assets/ 中的 PNG/ICNS/ICO 檔案。');
