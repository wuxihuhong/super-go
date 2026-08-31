/**
 * 从 renderer/assets/app-icon.svg 生成 electron-builder 所需的 png / icns / ico。
 * 依赖本机 rsvg-convert、magick、iconutil（macOS）。改了 SVG 后重跑本脚本。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcSvg = join(appDir, 'src/renderer/assets/app-icon.svg');
const outDir = join(appDir, 'build');
const tmpDir = join(outDir, 'icon.iconset');

function requireBin(name) {
  try {
    execFileSync('which', [name], { stdio: 'pipe' });
  } catch {
    console.error(`[icons] 缺少 ${name}，无法生成安装包图标`);
    process.exit(1);
  }
}

requireBin('rsvg-convert');
requireBin('magick');
requireBin('iconutil');
requireBin('sips');

mkdirSync(outDir, { recursive: true });
copyFileSync(srcSvg, join(outDir, 'icon.svg'));

const png1024 = join(outDir, 'icon.png');
execFileSync('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', png1024, srcSvg]);

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const iconset = {
  'icon_16x16.png': 16,
  'icon_16x16@2x.png': 32,
  'icon_32x32.png': 32,
  'icon_32x32@2x.png': 64,
  'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256,
  'icon_256x256.png': 256,
  'icon_256x256@2x.png': 512,
  'icon_512x512.png': 512,
  'icon_512x512@2x.png': 1024,
};

for (const [name, size] of Object.entries(iconset)) {
  execFileSync('sips', ['-z', String(size), String(size), png1024, '--out', join(tmpDir, name)], {
    stdio: 'pipe',
  });
}

execFileSync('iconutil', ['-c', 'icns', '-o', join(outDir, 'icon.icns'), tmpDir]);
rmSync(tmpDir, { recursive: true, force: true });

execFileSync('magick', [
  png1024,
  '-define',
  'icon:auto-resize=256,128,64,48,32,16',
  join(outDir, 'icon.ico'),
]);

console.log('[icons] wrote build/icon.png, build/icon.icns, build/icon.ico');
