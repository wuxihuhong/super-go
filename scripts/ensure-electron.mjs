/**
 * Electron 二进制兜底下载 + dev 门面改名（root postinstall）。
 *
 * pnpm 10 默认拦截依赖构建脚本；onlyBuiltDependencies（pnpm-workspace.yaml）
 * 是正规放行方式，但 store 缓存了未构建状态时 postinstall 不会补跑。
 * 这里幂等检查：二进制在（path.txt 存在）则直接跳过，否则执行 electron 自带的
 * install.js（遵循 ELECTRON_MIRROR 等环境变量）。
 *
 * macOS：Electron.app 的 CFBundleName/CFBundleDisplayName 改为 Super Go——
 * dev 模式（pnpm dev / npx electron .）的菜单栏与 Dock 显示应用名而非 "Electron"
 * （macOS 从进程 bundle 读名字，运行时 setName 改不了；打包版不受影响）。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'Super Go';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const electronDir = join(root, 'packages', 'app', 'node_modules', 'electron');

if (!existsSync(electronDir)) {
  console.log('[ensure-electron] electron 包尚未链接，跳过');
  process.exit(0);
}

if (!existsSync(join(electronDir, 'path.txt'))) {
  console.log('[ensure-electron] 下载 Electron 二进制 ...');
  const result = spawnSync(process.execPath, ['install.js'], {
    cwd: electronDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// dev 门面改名 + 换图标（仅 macOS，幂等）；失败只警告不阻断安装
if (process.platform === 'darwin') {
  const appBundle = join(electronDir, 'dist', 'Electron.app');
  const plist = join(appBundle, 'Contents', 'Info.plist');
  if (existsSync(plist)) {
    try {
      const current = readFileSync(plist, 'utf8');
      if (!current.includes(`<string>${APP_NAME}</string>`)) {
        let failed = false;
        for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
          const r = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${APP_NAME}`, plist]);
          if (r.error !== undefined || r.status !== 0) {
            failed = true;
            console.warn(
              `[ensure-electron] PlistBuddy 设置 ${key} 失败（status=${r.status ?? 'NA'} ${r.error ?? ''}），dev 名仍为 Electron`,
            );
          }
        }
        if (!failed) console.log(`[ensure-electron] dev 门面已改名: ${APP_NAME}`);
      }
      // dev 图标：用产品图标覆盖默认 Electron 图标（同名 electron.icns，Info.plist 无需改）
      const defaultIcon = join(appBundle, 'Contents', 'Resources', 'electron.icns');
      const productIcon = join(root, 'packages', 'app', 'build', 'icon.icns');
      if (existsSync(productIcon) && existsSync(defaultIcon)) {
        const currentIcon = readFileSync(defaultIcon, 'utf8');
        const wantIcon = readFileSync(productIcon, 'utf8');
        if (currentIcon !== wantIcon) {
          copyFileSync(productIcon, defaultIcon);
          console.log('[ensure-electron] dev 图标已替换');
        }
      }
    } catch (err) {
      console.warn('[ensure-electron] Info.plist/图标修改失败（不影响功能）:', err);
    }
  }
}
