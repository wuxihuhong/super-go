/**
 * 评估视角换算：引擎 info 分是走子方视角，快照/UI 统一成红方视角。
 * 行棋方必须取局面本身的 turn，不能用着法序号奇偶——连线从中局灌入时
 * 根局面可能轮黑，i % 2 会把黑的评估当成红，优势与杀棋对调。
 */
import type { Player } from '@super-go/core';

/** 走子方视角 → 红方视角（正 = 红优 / 红杀） */
export function toRedPerspective(
  mover: Player,
  cp?: number,
  mate?: number,
): { redCp?: number; redMate?: number } {
  const flip = mover === 'first' ? 1 : -1;
  return {
    redCp: cp === undefined ? undefined : cp * flip,
    redMate: mate === undefined ? undefined : mate * flip,
  };
}
