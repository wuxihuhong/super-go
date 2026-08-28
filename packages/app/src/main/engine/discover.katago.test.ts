import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findKatagoModel } from './discover';
import { defaultGtpConfig } from './katagoConfig';

const root = join(process.cwd(), 'node_modules', '.tmp-katago-discover');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('findKatagoModel', () => {
  it('优先 kata1-b18，忽略 human 模型', () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'other.bin.gz'), 'x');
    writeFileSync(join(root, 'kata1-b10c128-s1.bin.gz'), 'x');
    writeFileSync(join(root, 'human.bin.gz'), 'x');
    expect(findKatagoModel([root])).toMatch(/kata1-b10c128/);
    writeFileSync(join(root, 'kata1-b18c384nbt-s1.bin.gz'), 'x');
    expect(findKatagoModel([root])).toMatch(/kata1-b18/);
  });

  it('目录不存在返回 null', () => {
    expect(findKatagoModel([join(root, 'missing')])).toBeNull();
  });
});

describe('defaultGtpConfig', () => {
  it('写入线程数与中式规则', () => {
    const text = defaultGtpConfig({ logDir: '/tmp/logs', numSearchThreads: 4 });
    expect(text).toContain('numSearchThreads = 4');
    expect(text).toContain('rules = chinese');
    expect(text).toContain('ponderingEnabled = false');
  });
});

describe('brew 路径（本机有则命中）', () => {
  it('mac brew katago 可执行存在时 existsSync', () => {
    if (existsSync('/opt/homebrew/bin/katago')) {
      expect(existsSync('/opt/homebrew/bin/katago')).toBe(true);
    }
  });
});
