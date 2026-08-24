/**
 * 引擎可执行文件发现（node:fs，无 Electron——单测/主进程共用）。
 *
 * P1 约定：engines/chess/<发行包目录>/ 下按平台取 Pikafish；
 * 用户在设置里显式指定的路径优先（§5.6 用户值优先，探测不覆盖）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES: Record<string, string[]> = {
  darwin: ['MacOS/pikafish-apple-silicon', 'MacOS/pikafish-intel'],
  linux: ['Linux/pikafish-avx2', 'Linux/pikafish-bmi2', 'Linux/pikafish-sse41-popcnt'],
  win32: ['pikafish-avx2.exe', 'pikafish-bmi2.exe', 'pikafish-sse41-popcnt.exe'],
};

/** 在 enginesDir（= <repo>/engines/chess）下找本平台 Pikafish */
export function findPikafishBinary(enginesDir: string, platform: string): string | null {
  const patterns = CANDIDATES[platform];
  if (patterns === undefined || !existsSync(enginesDir)) return null;
  for (const entry of readdirSync(enginesDir)) {
    for (const pattern of patterns) {
      const path = join(enginesDir, entry, pattern);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

/** 引擎根目录候选：用户覆盖 > 开发仓库 > 打包资源 */
export function enginesRootCandidates(opts: {
  overridePath?: string;
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string[] {
  const roots: string[] = [];
  if (opts.overridePath !== undefined && opts.overridePath !== '') {
    roots.push(opts.overridePath);
  }
  if (opts.isPackaged) {
    roots.push(join(opts.resourcesPath, 'engines', 'chess'));
  } else {
    // dev：appPath = packages/app → 仓库根
    roots.push(join(opts.appPath, '..', '..', 'engines', 'chess'));
  }
  return roots;
}
