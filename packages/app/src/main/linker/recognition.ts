/**
 * 识别帧 → 红方视角盘面：翻转检测（将位）+ 静态合法性校验（防线一、二层）。
 * 纯函数，可单测。任何一步不过 → 整帧丢弃（null），扫描循环下一轮重试。
 */
import { boardIndex, INITIAL_FEN, parseFen, validateRecognizedBoard, type RecognizedBoard } from '@super-go/core';
import type { XiangqiPiece } from '@super-go/core';
import {
  findBoardBox,
  gridFromBox,
  refineGrid,
  snapToBoard,
  type BoardBox,
  type BoardGrid,
} from './boardGeometry';
import type { LocateHint } from '../../shared/linker';
import type { Detection } from './yolo/postprocess';

/** 逐帧识别日志默认关闭；SUPER_GO_LINKER_DIAG=1 不会打开 */
const DIAG = process.env['SUPER_GO_LINKER_DIAG_FRAME'] !== undefined;
const diag = (text: string): void => {
  if (DIAG) console.log(`[diag:rec] ${text}`);
};

export interface RecognizedFrame {
  /** 红方视角（已归一化）90 格盘面 */
  board: RecognizedBoard;
  /** 平台视角是否翻转（黑在下） */
  reversed: boolean;
  /** 本帧棋盘框（图像像素） */
  box: BoardBox;
  /** 本帧点击网格（图像像素）：优先棋子中心拟合，退化时为框推导的粗网格 */
  grid: BoardGrid;
  /** grid 是否来自棋子中心拟合（false = 粗网格兜底，精度较低） */
  gridRefined: boolean;
}

export type RecognizeOk = { ok: true; frame: RecognizedFrame };
export type RecognizeFail = { ok: false; kind: Exclude<LocateHint, 'captureFailed'> };
export type RecognizeResult = RecognizeOk | RecognizeFail;

/** 找不到棋盘框 / 找不到将 / 静态校验不过 → 带 kind 的失败 */
export function recognizeFrame(detections: readonly Detection[]): RecognizeResult {
  if (detections.length === 0) {
    diag('empty detections');
    return { ok: false, kind: 'noBoard' };
  }
  const box = findBoardBox(detections);
  if (box === null) {
    diag('no board box');
    return { ok: false, kind: 'invalidBoard' };
  }
  // 粗网格吸附 → 棋子中心拟合精修 → 用精修网格再吸附一遍（框有系统偏差时救回边缘棋子）
  const coarse = gridFromBox(box);
  const refined = refineGrid(detections, coarse);
  const grid = refined ?? coarse;
  if (refined === null) diag('grid refine declined; using coarse grid');
  const board = snapToBoard(detections, grid);
  const reversed = isReversed(board);
  if (reversed === null) {
    diag('no king found');
    return { ok: false, kind: 'noKing' };
  }
  const normalized = reversed === true ? flipBoard(board) : board;
  const issues = validateRecognizedBoard(normalized);
  if (issues.length > 0) {
    if (DIAG) {
      diag(
        `sanity issues: ${issues.map((i) => `${i.piece}@${i.index}:${i.reason}`).join(' ').slice(0, 300)}`,
      );
      for (let y = 0; y < 10; y++) {
        diag('  ' + Array.from({ length: 9 }, (_, x) => normalized[y * 9 + x] ?? '.').join(''));
      }
    }
    return { ok: false, kind: 'invalidBoard' };
  }
  return { ok: true, frame: { board: normalized, reversed, box, grid, gridRefined: refined !== null } };
}

/** 低于此峰值视为几乎空帧（噪声），否则是「看到了但不够自信」 */
const LOCATE_EMPTY_PEAK = 0.08;

/** 空帧 + 可见峰值 → lowConfidence；其余 kind 原样返回 */
export function refineLocateHint(
  kind: Exclude<LocateHint, 'captureFailed'>,
  peakScore: number,
): LocateHint {
  if (kind === 'noBoard' && peakScore > LOCATE_EMPTY_PEAK) return 'lowConfidence';
  return kind;
}

/**
 * 翻转检测：红帅在黑区（y≤2）或黑将在红区（y≥7）→ 平台视角翻转。
 * 两个将都识别不到 → 无法判定（返回 null 语义由调用方作为丢帧处理）。
 */
export function isReversed(board: RecognizedBoard): boolean | null {
  let redKingRow = -1;
  let blackKingRow = -1;
  for (let y = 0; y < 10; y++) {
    for (let x = 3; x <= 5; x++) {
      const piece = board[boardIndex(x, y)];
      if (piece === 'K') redKingRow = y;
      else if (piece === 'k') blackKingRow = y;
    }
  }
  if (redKingRow === -1 && blackKingRow === -1) return null;
  if (redKingRow >= 0 && redKingRow <= 2) return true;
  if (blackKingRow >= 0 && blackKingRow >= 7) return true;
  return false;
}

/** 中心对称翻转（board[i] ↔ board[89-i]） */
export function flipBoard(board: RecognizedBoard): (XiangqiPiece | null)[] {
  const out = board.slice() as (XiangqiPiece | null)[];
  for (let i = 0; i < 45; i++) {
    const j = 89 - i;
    const tmp = out[i]!;
    out[i] = out[j] ?? null;
    out[j] = tmp;
  }
  return out;
}

/** 识别盘是否为标准初始布局（平台开新局的快速判定） */
export function isInitialBoard(board: RecognizedBoard): boolean {
  for (let i = 0; i < 90; i++) {
    if (board[i] !== INITIAL_BOARD[i]) return false;
  }
  return true;
}

const INITIAL_BOARD = parseFen(INITIAL_FEN).board as (XiangqiPiece | null)[];
