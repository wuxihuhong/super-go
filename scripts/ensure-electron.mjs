/**
 * Electron 二进制兜底下载（root postinstall）。
 *
 * pnpm 10 默认拦截依赖构建脚本；onlyBuiltDependencies（pnpm-workspace.yaml）
 * 是正规放行方式，但 store 缓存了未构建状态时 postinstall 不会补跑。
 * 这里幂等检查：二进制在（path.txt 存在）则直接跳过，否则执行 electron 自带的
 * install.js（遵循 ELECTRON_MIRROR 等环境变量）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const electronDir = join(root, 'packages', 'app', 'node_modules', 'electron');

if (!existsSync(electronDir)) {
  console.log('[ensure-electron] electron 包尚未链接，跳过');
  process.exit(0);
}
if (existsSync(join(electronDir, 'path.txt'))) {
  process.exit(0);
}

console.log('[ensure-electron] 下载 Electron 二进制 ...');
const result = spawnSync(process.execPath, ['install.js'], {
  cwd: electronDir,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
