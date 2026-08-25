/**
 * 识别端到端（真实模型 + 真实截图 fixture）：
 * 完整链路 = 裁窗 → letterbox(双线性) → onnxruntime 推理 → 解码/NMS → 粗网格吸附
 * → 棋子中心拟合精修 → 二次吸附 → 静态校验。
 *
 * 2026-08-25：TCHESS 用例从"只打诊断"升级为硬断言——此前的"模型对该界面风格泛化
 * 有限"是被 fixture 的全屏缩放误导的结论，按生产口径裁窗后 32 子全部 ≥0.94 置信度。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, toFen } from '@super-go/core';
import { toPosition } from './diff';
import { detectFixture, FIXTURES_DIR, MODEL_PATH } from './e2eFixture';
import { isInitialBoard, recognizeFrame } from './recognition';

describe.skipIf(!existsSync(MODEL_PATH))('识别端到端（真模型 + 截图 fixture）', () => {
  it('标准平台风格截图（测试靶）识别出标准初始局面', { timeout: 60_000 }, async () => {
    if (!existsSync(join(FIXTURES_DIR, 'screen-initial.png'))) return;
    const frame = recognizeFrame(await detectFixture('screen-initial.png'));
    if (frame === null) throw new Error('recognizeFrame null');
    expect(frame.reversed).toBe(false);
    expect(isInitialBoard(frame.board)).toBe(true);
    expect(toFen(toPosition(frame.board, 'first')).split(' ')[0]).toBe(INITIAL_FEN.split(' ')[0]);
  });

  it('TCHESS 真实平台截图：识别出截图中的实际局面（炮八平五 马2进3 后）', { timeout: 60_000 }, async () => {
    if (!existsSync(join(FIXTURES_DIR, 'tchess-init.png'))) return;
    const frame = recognizeFrame(await detectFixture('tchess-init.png'));
    if (frame === null) throw new Error('recognizeFrame null');
    expect(frame.reversed).toBe(false); // TCHESS 红在下
    expect(toFen(toPosition(frame.board, 'first')).split(' ')[0]).toBe(
      'r1bakabnr/9/1cn4c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR',
    );
  });
});
