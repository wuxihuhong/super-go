/**
 * 打包：electron-builder 的 version 只读 vite 写好的 `.app-version`
 *（或环境变量 APP_VERSION），不再自己算日期。
 * 覆盖：APP_VERSION=1.0.0-20260101 node scripts/electron-builder.mjs --mac
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOST_OVERLAY_FILE,
  applyLinuxMacDirArgs,
  hostBuildNotes,
  hostCliOverrides,
  hostConfigOverlay,
} from './host-build-overrides.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(appDir, '../..');
const guardedPackageJson = [join(repoRoot, 'package.json'), join(appDir, 'package.json')].map(
  (path) => ({ path, text: readFileSync(path, 'utf8') }),
);

function restorePackageJsonIfRewritten() {
  for (const file of guardedPackageJson) {
    const now = existsSync(file.path) ? readFileSync(file.path, 'utf8') : '';
    if (now === file.text) continue;
    writeFileSync(file.path, file.text);
    console.warn(`[build] 已还原被 electron-builder 改写的 ${file.path}`);
  }
}

function resolvePackagedVersion() {
  const override = process.env['APP_VERSION'];
  if (override !== undefined && override !== '') return override;
  const stamp = join(appDir, '.app-version');
  if (!existsSync(stamp)) {
    console.error('[build] 缺少 .app-version：请先跑 electron-vite build');
    process.exit(1);
  }
  const text = readFileSync(stamp, 'utf8').trim();
  if (text === '') {
    console.error('[build] .app-version 为空');
    process.exit(1);
  }
  return text;
}

const version = resolvePackagedVersion();
const rawArgs = process.argv.slice(2);
const hostArgs = process.platform === 'linux' ? applyLinuxMacDirArgs(rawArgs) : rawArgs;
const args = [...hostArgs, `-c.extraMetadata.version=${version}`];
const overlay = hostConfigOverlay(process.platform);
const env = { ...process.env, APP_VERSION: version };
if (overlay !== null) {
  const overlayPath = join(appDir, HOST_OVERLAY_FILE);
  writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
  args.push('--config', overlayPath, ...hostCliOverrides(process.platform));
  env.CSC_IDENTITY_AUTO_DISCOVERY = process.env['CSC_IDENTITY_AUTO_DISCOVERY'] ?? 'false';
  for (const note of hostBuildNotes(process.platform)) console.log(`[build] ${note}`);
}

for (const name of ['icon.png', 'icon.icns', 'icon.ico']) {
  if (existsSync(join(appDir, 'build', name))) continue;
  console.error(`[build] 缺少 build/${name}：先跑 pnpm --filter @super-go/app icons`);
  process.exit(1);
}

console.log(`[build] version ${version}`);
const result = spawnSync('pnpm', ['exec', 'electron-builder', ...args], {
  cwd: appDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});
restorePackageJsonIfRewritten();
process.exit(result.status ?? 1);
