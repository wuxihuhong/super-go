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
  // avx512icl 优先（AVX-512 路径，Zen5 如 9950X3D / IceLake+ 命中最优），
  // 逐级回退兼容老 CPU；都不在则用户可在设置里指定路径（§5.6 逃生口）
  win32: [
    'pikafish-avx512icl.exe',
    'pikafish-vnni512.exe',
    'pikafish-avx512.exe',
    'pikafish-avxvnni.exe',
    'pikafish-bmi2.exe',
    'pikafish-avx2.exe',
    'pikafish-sse41-popcnt.exe',
  ],
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
  /** 缺省 chess，围棋用 go */
  kind?: 'chess' | 'go';
}): string[] {
  const folder = opts.kind === 'go' ? 'go' : 'chess';
  const roots: string[] = [];
  if (opts.overridePath !== undefined && opts.overridePath !== '') {
    roots.push(opts.overridePath);
  }
  if (opts.isPackaged) {
    roots.push(join(opts.resourcesPath, 'engines', folder));
  } else {
    // dev：appPath = packages/app → 仓库根
    roots.push(join(opts.appPath, '..', '..', 'engines', folder));
  }
  return roots;
}

const BREW_KATAGO_BINS = [
  '/opt/homebrew/bin/katago',
  '/usr/local/bin/katago',
] as const;

const BREW_KATAGO_MODEL_DIRS = [
  '/opt/homebrew/opt/katago/share/katago',
  '/usr/local/opt/katago/share/katago',
] as const;

export function findKatagoBinaryOnPath(): string | null {
  for (const p of BREW_KATAGO_BINS) {
    if (existsSync(p)) return p;
  }
  const pathEnv = process.env['PATH'] ?? '';
  for (const dir of pathEnv.split(':')) {
    if (dir === '') continue;
    const candidate = join(dir, 'katago');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 在 engines/go 或 brew 目录下找主模型（优先 kata1-b18） */
export function findKatagoModel(searchDirs: readonly string[]): string | null {
  const preferred: string[] = [];
  const fallback: string[] = [];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.bin.gz') || name.includes('human')) continue;
      const full = join(dir, name);
      if (name.startsWith('kata1-b18')) preferred.push(full);
      else fallback.push(full);
    }
  }
  return preferred[0] ?? fallback[0] ?? null;
}

export function brewKatagoModelDirs(): string[] {
  return BREW_KATAGO_MODEL_DIRS.filter((d) => existsSync(d));
}

export function resolveKatagoBinary(opts: {
  userPath?: string;
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string | null {
  if (opts.userPath !== undefined && opts.userPath !== '' && existsSync(opts.userPath)) {
    return opts.userPath;
  }
  for (const root of enginesRootCandidates({ ...opts, kind: 'go' })) {
    if (!existsSync(root)) continue;
    const direct = join(root, 'katago');
    if (existsSync(direct)) return direct;
    try {
      for (const entry of readdirSync(root)) {
        const candidate = join(root, entry, process.platform === 'win32' ? 'katago.exe' : 'katago');
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      /* skip */
    }
  }
  return findKatagoBinaryOnPath();
}

export function resolveKatagoModel(opts: {
  userPath?: string;
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string | null {
  if (opts.userPath !== undefined && opts.userPath !== '' && existsSync(opts.userPath)) {
    return opts.userPath;
  }
  const dirs = [
    ...enginesRootCandidates({ ...opts, kind: 'go' }),
    ...brewKatagoModelDirs(),
  ];
  return findKatagoModel(dirs);
}
