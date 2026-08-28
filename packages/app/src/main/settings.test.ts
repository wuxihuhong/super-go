/**
 * 配置迁移（纯函数，Node 直跑）。
 * 用户配置是长期资产：迁移写错的表现是"设置莫名其妙变回默认"，事后极难查，
 * 所以每加一条迁移都要在这里钉住。
 */
import { describe, expect, it } from 'vitest';
import { migrateSettings } from './settings';

describe('migrateSettings', () => {
  it('非对象输入按空配置处理', () => {
    expect(migrateSettings(null)).toEqual({});
    expect(migrateSettings('x')).toEqual({});
    expect(migrateSettings(42)).toEqual({});
  });

  it('原样保留已经是当前结构的配置', () => {
    const cur = { theme: 'dark', linker: { scanIntervalMs: 50, backgroundCapture: false } };
    expect(migrateSettings(cur)).toMatchObject(cur);
  });

  it('旧 engine 字段 → xiangqi.enginePath / strength.movetime', () => {
    const out = migrateSettings({ engine: { path: '/bin/pikafish', thinkMs: 800 } });
    expect(out.xiangqi?.enginePath).toBe('/bin/pikafish');
    expect(out.xiangqi?.strength?.movetime).toBe(800);
    expect('engine' in out).toBe(false);
  });

  it('已有 xiangqi.enginePath 时不被旧字段覆盖（用户值优先）', () => {
    const out = migrateSettings({
      engine: { path: '/old' },
      xiangqi: { enginePath: '/new' },
    });
    expect(out.xiangqi?.enginePath).toBe('/new');
  });

  it('旧 backMode → backgroundClick（它实际只控制点击，不控制截图）', () => {
    const out = migrateSettings({ linker: { backMode: true, scanIntervalMs: 120 } });
    expect(out.linker?.backgroundClick).toBe(true);
    expect(out.linker?.scanIntervalMs).toBe(120); // 同级其他字段不丢
    expect('backMode' in (out.linker ?? {})).toBe(false);
    // backgroundCapture 不由旧值决定，留给默认值
    expect(out.linker?.backgroundCapture).toBeUndefined();
  });

  it('backMode=false 也要迁移（而不是当作未设置）', () => {
    expect(migrateSettings({ linker: { backMode: false } }).linker?.backgroundClick).toBe(false);
  });

  it('没有旧字段时不凭空造出 linker/xiangqi', () => {
    const out = migrateSettings({ theme: 'light' });
    expect(out.linker).toBeUndefined();
    expect(out.xiangqi).toBeUndefined();
  });

  it('连线里显式设过的行棋延迟迁到 xiangqi，并从 linker 去掉', () => {
    const out = migrateSettings({
      linker: { scanIntervalMs: 80, moveDelayMinSec: 1, moveDelayMaxSec: 8 },
    });
    expect(out.xiangqi?.moveDelayMinSec).toBe(1);
    expect(out.xiangqi?.moveDelayMaxSec).toBe(8);
    expect(out.linker?.scanIntervalMs).toBe(80);
    expect(out.linker).not.toHaveProperty('moveDelayMinSec');
    expect(out.linker).not.toHaveProperty('moveDelayMaxSec');
  });

  it('连线延迟为默认 0–0 不覆盖：旧文件一律写出过 0–0，无法与「显式立即走」区分，本机仍走 0.3–0.9', () => {
    const out = migrateSettings({
      linker: { moveDelayMinSec: 0, moveDelayMaxSec: 0 },
    });
    expect(out.xiangqi?.moveDelayMinSec).toBeUndefined();
    expect(out.xiangqi?.moveDelayMaxSec).toBeUndefined();
    expect(out.linker).not.toHaveProperty('moveDelayMinSec');
  });

  it('已有 xiangqi 延迟时不被旧连线字段覆盖', () => {
    const out = migrateSettings({
      xiangqi: { strength: {}, moveDelayMinSec: 0.3, moveDelayMaxSec: 0.9 },
      linker: { moveDelayMinSec: 2, moveDelayMaxSec: 5 },
    });
    expect(out.xiangqi?.moveDelayMinSec).toBe(0.3);
    expect(out.xiangqi?.moveDelayMaxSec).toBe(0.9);
    expect(out.linker).not.toHaveProperty('moveDelayMinSec');
  });
});
