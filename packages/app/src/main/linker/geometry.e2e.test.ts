/**
 * 点击几何端到端（真实模型 + 真实截图 fixture）：守住"点击点落在棋子中心上"。
 *
 * 这是"走子不准"的回归防线——2026-08-25 实测：旧的 gridClickPoint 把"外扩 0.8 格"
 * 实现成"缩小格距"，点击点向盘心收缩，TCHESS 上边线最大偏 0.98 格（几乎正好落在
 * 相邻交叉点上）。断言口径取"每格的点击坐标 vs 落在该格的棋子检测中心"，
 * 单位是格距——与平台皮肤、分辨率无关。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toFen } from '@super-go/core';
import { gridPoint, type BoardGrid } from './boardGeometry';
import { toPosition } from './diff';
import { detectFixture, FIXTURES_DIR, MODEL_PATH } from './e2eFixture';
import { recognizeFrame } from './recognition';
import type { Detection } from './yolo/postprocess';

/** 点击点相对棋子中心的最大容许偏差（格距倍数） */
const MAX_CLICK_ERROR_CELLS = 0.15;

/**
 * 真机落盘的失败帧（已是窗口图，无需裁窗）：TCHESS 把一条走子箭头和红色选中角标
 * 画在了黑炮上，该子的正确类别只剩 0.310 —— 旧的 0.5 阈值把它整枚漏掉，
 * 于是整局对局建立在少一枚子的局面上，且前后帧自洽、不报任何错。
 * 这一条守住"覆盖物压低置信度时仍不漏子"。
 */
const OVERLAY_CASE = {
  name: 'tchess-overlay.png',
  board: '3a4C/4ak3/b5N1b/p1p3P1p/9/2P1P4/c7P/4c4/4A4/1NBAK2R1',
  pieces: 22,
} as const;

/**
 * 逐格比对：该格的点击坐标 vs 落在该格的最高分检测中心。
 * 按格去重（同格的低分幽灵检测不参与，与 snapToBoard 同口径）。
 */
function clickError(
  detections: readonly Detection[],
  grid: BoardGrid,
): { maxCells: number; cells: number } {
  const best = new Map<number, Detection>();
  for (const det of detections) {
    if (det.label === '0') continue;
    const col = Math.round((det.cx - grid.originX) / grid.stepX);
    const row = Math.round((det.cy - grid.originY) / grid.stepY);
    if (col < 0 || col > 8 || row < 0 || row > 9) continue;
    const key = row * 9 + col;
    const cur = best.get(key);
    if (cur === undefined || det.score > cur.score) best.set(key, det);
  }
  let maxCells = 0;
  for (const [key, det] of best) {
    const p = gridPoint(grid, key % 9, Math.floor(key / 9));
    maxCells = Math.max(
      maxCells,
      Math.abs(p.x - det.cx) / grid.stepX,
      Math.abs(p.y - det.cy) / grid.stepY,
    );
  }
  return { maxCells, cells: best.size };
}

describe.skipIf(!existsSync(MODEL_PATH))('点击几何端到端（真模型 + 截图 fixture）', () => {
  it(`${OVERLAY_CASE.name}：棋子被走子箭头/选中角标压住时不漏子`, { timeout: 60_000 }, async () => {
    if (!existsSync(join(FIXTURES_DIR, OVERLAY_CASE.name))) return;
    const detections = await detectFixture(OVERLAY_CASE.name, false);
    const rec = recognizeFrame(detections);
    if (!rec.ok) throw new Error(`${OVERLAY_CASE.name}: recognizeFrame ${rec.kind}`);
    const frame = rec.frame;

    const { maxCells, cells } = clickError(detections, frame.grid);
    console.log(
      `[${OVERLAY_CASE.name}] reversed=${frame.reversed} refined=${frame.gridRefined} ` +
        `cells=${cells} maxErr=${maxCells.toFixed(3)}`,
    );
    expect(frame.reversed).toBe(true); // 该帧平台视角为红在上
    expect(cells).toBe(OVERLAY_CASE.pieces);
    expect(maxCells).toBeLessThan(MAX_CLICK_ERROR_CELLS);
    expect(toFen(toPosition(frame.board, 'first')).split(' ')[0]).toBe(OVERLAY_CASE.board);
  });
});
