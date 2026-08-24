import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { enginesRootCandidates, findPikafishBinary } from './discover';

/** 临时 engines/chess 目录骨架（<dir>/<发行包>/<平台路径>/<文件>） */
const root = join(process.cwd(), 'node_modules', '.tmp-discover-test');
const distDir = join(root, 'pikafish-test');
function put(rel: string): void {
  const file = join(distDir, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'stub');
}
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('findPikafishBinary 平台候选', () => {
  it('win32：avx512icl 优先于其余变体（9950X3D 等 AVX-512 CPU 命中最优）', () => {
    put('pikafish-avx2.exe');
    expect(findPikafishBinary(root, 'win32')).toMatch(/pikafish-avx2\.exe$/);
    put('pikafish-bmi2.exe');
    expect(findPikafishBinary(root, 'win32')).toMatch(/pikafish-bmi2\.exe$/); // bmi2 档在 avx2 前
    put('pikafish-avx512icl.exe');
    expect(findPikafishBinary(root, 'win32')).toMatch(/pikafish-avx512icl\.exe$/);
  });

  it('darwin：取 MacOS/apple-silicon（NNUE 同目录）', () => {
    put(join('MacOS', 'pikafish-apple-silicon'));
    put(join('MacOS', 'pikafish.nnue'));
    expect(findPikafishBinary(root, 'darwin')).toMatch(
      new RegExp(`pikafish-test.*MacOS.*pikafish-apple-silicon`),
    );
  });

  it('目录不存在 / 平台未知 → null（不抛错）', () => {
    expect(findPikafishBinary(join(root, 'nope'), 'win32')).toBeNull();
    expect(findPikafishBinary(root, 'freebsd')).toBeNull();
  });
});

describe('enginesRootCandidates 根目录优先级', () => {
  it('用户覆盖 > 打包资源 / 开发仓库', () => {
    expect(
      enginesRootCandidates({
        overridePath: '/custom/engines/chess',
        appPath: '/app/packages/app',
        isPackaged: true,
        resourcesPath: '/res',
      }),
    ).toEqual(['/custom/engines/chess', join('/res', 'engines', 'chess')]);
    expect(
      enginesRootCandidates({
        appPath: '/app/packages/app',
        isPackaged: false,
        resourcesPath: '/res',
      }),
    ).toEqual([join('/app/packages/app', '..', '..', 'engines', 'chess')]);
  });
});

describe('打包产物集成（dist 存在才跑，缺产物自动跳过）', () => {
  it('mac unpacked：resourcesPath/engines/chess 能命中 apple-silicon', () => {
    const dir = join(
      process.cwd(),
      'dist',
      'mac-arm64',
      'Super Go.app',
      'Contents',
      'Resources',
      'engines',
      'chess',
    );
    if (!existsSync(dir)) return;
    expect(findPikafishBinary(dir, 'darwin')).toMatch(/pikafish-apple-silicon$/);
  });

  it('win unpacked：resourcesPath/engines/chess 能命中 avx512icl', () => {
    const dir = join(process.cwd(), 'dist', 'win-unpacked', 'resources', 'engines', 'chess');
    if (!existsSync(dir)) return;
    expect(findPikafishBinary(dir, 'win32')).toMatch(/pikafish-avx512icl\.exe$/);
  });
});
