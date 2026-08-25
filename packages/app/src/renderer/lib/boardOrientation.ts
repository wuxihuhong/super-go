/**
 * 棋盘朝向（纯函数，可单测）。
 *
 * **朝向在开局那一刻确定，此后只有一个东西能改它：平台自己翻了视角。**
 * 连线也是开局（连线 = 以平台识别局面重开一局，§6.1），它的锚定来自平台视角。
 * 除此之外没有任何操作能翻转棋盘——目前 UI 里也没有手动翻转控件。
 *
 * 因此这两件事**都不得翻转棋盘**：
 * - **对局中切换引擎执方**。用户正盯着一个局面，突然转 180° 是灾难性体验；而且执红/执黑
 *   是两个独立开关，"都开"是互搏、"都关"是人执双方，这些状态下"翻转"根本没有对应语义；
 *   连线中翻还会和平台视角拧反，违反 §6.1。
 * - **停止连线**。停止后对局是保留的（可继续手动下/复盘），局面没动，棋盘就不能动。
 *
 * 历史教训（都是真出过的 bug）：
 * 1. 切换执方时无条件 `userFlipped = !userFlipped`，朝向取决于按钮被点了奇数次还是偶数次；
 * 2. 朝向每次渲染现算（连线中用平台视角、否则用开局锚定），于是停止连线的瞬间会掉回
 *    陈旧的锚定值，凭空翻一次。所以朝向必须是**状态**，不是**算出来的**。
 */
import type { EngineSide } from '@super-go/core';

/** 开局锚定：引擎执红 ⇒ 人执黑 ⇒ 翻转（互搏/无引擎按红方视角） */
export function anchorFlipFor(engineSide: EngineSide): boolean {
  return engineSide === 'first';
}

/** 能改变朝向的全部事件——只有这两个 */
export type OrientationEvent =
  /** 开了一局本机对弈：按人类执方锚定 */
  | { type: 'newGame'; engineSide: EngineSide }
  /** 连线识别到平台视角（开局锚定，或对局中平台自己翻了） */
  | { type: 'platformView'; reversed: boolean };

/** 朝向状态转移。未列出的事件（切换执方、停止连线、悔棋…）一律不改朝向。 */
export function nextBoardFlip(current: boolean, event: OrientationEvent): boolean {
  switch (event.type) {
    case 'newGame':
      return anchorFlipFor(event.engineSide);
    case 'platformView':
      return event.reversed;
    default:
      return current;
  }
}
