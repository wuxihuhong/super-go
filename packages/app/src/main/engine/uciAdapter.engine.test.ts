/**
 * 真实引擎集成测试（无 GUI 回归闭环，DESIGN.md §9 P1 验收的自动化部分）。
 *
 * 探测 engines/chess/<发行包>/ 下的本平台 Pikafish；缺失则 skip（CI 无引擎时不阻塞门禁）。
 * 覆盖：launch 握手 → 强度档下发 → 快照同步（含 moves 重发）→ genmove → 本地规则校验 → 退出广播。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  iccsToMove,
  INITIAL_FEN,
  XiangqiGame,
  XIANGQI_ELO_MAX,
  XIANGQI_ELO_MIN,
} from '@super-go/core';
import { UciAdapter } from './uciAdapter';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');

/** 按当前平台探测 Pikafish 可执行文件（跨平台候选不可混用：Windows 无法执行 Mach-O/ELF，
 *  探到也只能挂起超时；非本平台的二进制当不存在处理，走 skipIf 缺引擎跳过路径） */
function findPikafish(): string | null {
  const enginesDir = join(REPO_ROOT, 'engines', 'chess');
  if (!existsSync(enginesDir)) return null;
  const candidates: Array<(dir: string) => string> =
    process.platform === 'win32'
      ? [(dir) => join(dir, 'pikafish-avx2.exe'), (dir) => join(dir, 'Windows', 'pikafish-avx2.exe')]
      : process.platform === 'darwin'
        ? [
            (dir) => join(dir, 'MacOS', 'pikafish-apple-silicon'),
            (dir) => join(dir, 'MacOS', 'pikafish-intel'),
          ]
        : [(dir) => join(dir, 'Linux', 'pikafish-avx2')];
  for (const entry of readdirSync(enginesDir)) {
    for (const build of candidates) {
      const path = build(join(enginesDir, entry));
      if (existsSync(path)) return path;
    }
  }
  return null;
}

const binary = findPikafish();
const adapter = new UciAdapter();
const game = new XiangqiGame();

afterAll(() => {
  adapter.quit();
});

describe.skipIf(binary === null)('UciAdapter × Pikafish 集成', () => {
  it('launch 握手：识别引擎与 UCI_Elo 选项', { timeout: 30_000 }, async () => {
    await adapter.launch(binary!);
    expect(adapter.engineName).toContain('Pikafish');
    const elo = adapter.options.get('UCI_Elo');
    expect(elo?.type).toBe('spin');
    expect(elo?.min).toBe(XIANGQI_ELO_MIN);
    expect(elo?.max).toBe(XIANGQI_ELO_MAX);
    expect(adapter.getStatus()).toBe('ready');
  });

  it('强度档下发 + 快照同步 + genmove 出合法着法（坐标校准）', { timeout: 30_000 }, async () => {
    await adapter.setStrength({ uciElo: 1400 });

    let position = game.initialPosition();
    const played: string[] = [];
    adapter.syncPosition(INITIAL_FEN, played);

    // 红方引擎走一步，本地规则校验（ICCS 坐标系一致性的实测校准）
    const red = await adapter.genmove({ movetimeMs: 300 });
    expect(red.move).toMatch(/^[a-i][0-9][a-i][0-9]$/);
    const redMove = iccsToMove(red.move!);
    expect(redMove).not.toBeNull();
    expect(game.isLegal(position, redMove!)).toBe(true);
    position = game.apply(position, redMove!).position;
    played.push(red.move!);

    // 黑方补一步已知合法着（马8进7），再让引擎走——验证 moves 全量重发通路
    const black = { kind: 'xiangqi' as const, from: { x: 7, y: 0 }, to: { x: 6, y: 2 } };
    position = game.apply(position, black).position;
    played.push('h9g7');
    adapter.syncPosition(INITIAL_FEN, played);

    const second = await adapter.genmove({ movetimeMs: 300 });
    expect(second.move).toMatch(/^[a-i][0-9][a-i][0-9]$/);
    const secondMove = iccsToMove(second.move!);
    expect(game.isLegal(position, secondMove!)).toBe(true);
  });

  it('setStrength(null) 复位满强度不报错（粘滞防线通路）', async () => {
    await adapter.setStrength(null);
    expect(adapter.getStatus()).toBe('ready');
  });

  it('quit 后 onExit 广播', { timeout: 15_000 }, async () => {
    const exited = new Promise<number | null>((resolve) => {
      adapter.onExit(resolve);
    });
    adapter.quit();
    await expect(exited).resolves.toBeDefined();
  });
});
