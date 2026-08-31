/**
 * 围棋识别帧：网格标定 → 交叉点分类。纯函数，可单测。
 * 截图由 LinkerNative 提供（与象棋同一条 Win/mac 通路），这里只解释像素。
 */
import type { GoCell, GoSize } from '@super-go/core';
import type { LocateHint } from '../../../shared/linker';
import type { BoardBox, BoardGrid } from '../boardGeometry';
import type { RawImage } from '../types';
import { classifyGoIntersections, nudgeGoGridOffChrome } from './goClassify';
import { detectGoGrid, goGridBox, goGridStillValid, type GoGrid } from './goGrid';

export interface RecognizedGoFrame {
  cells: readonly GoCell[];
  size: GoSize;
  /** 围棋识别按截图像素朝向，不做将位式翻转 */
  reversed: false;
  box: BoardBox;
  grid: BoardGrid;
  goGrid: GoGrid;
  gridRefined: boolean;
}

export type RecognizeGoOk = { ok: true; frame: RecognizedGoFrame };
export type RecognizeGoFail = { ok: false; kind: Exclude<LocateHint, 'captureFailed' | 'noKing'> };
export type RecognizeGoResult = RecognizeGoOk | RecognizeGoFail;

export function recognizeGoFrame(img: RawImage, prev: GoGrid | null = null): RecognizeGoResult {
  // 网格只标定一次：密盘每帧重找网会被底栏/成片子带偏。窗口缩放或盘面移位后重标。
  if (prev !== null && goGridStillValid(img, prev)) {
    return {
      ok: true,
      frame: {
        cells: classifyGoIntersections(img, prev),
        size: prev.size,
        reversed: false,
        box: goGridBox(prev),
        grid: prev,
        goGrid: prev,
        gridRefined: false,
      },
    };
  }

  const detected = detectGoGrid(img);
  if (detected === null) return { ok: false, kind: 'noBoard' };

  const goGrid = nudgeGoGridOffChrome(img, detected.grid);
  const cells = classifyGoIntersections(img, goGrid);
  return {
    ok: true,
    frame: {
      cells,
      size: goGrid.size,
      reversed: false,
      box: goGridBox(goGrid),
      grid: goGrid,
      goGrid,
      gridRefined: detected.confidence >= 0.85,
    },
  };
}

export function goBoardAscii(cells: readonly GoCell[], size: number): string {
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(
      Array.from({ length: size }, (_, x) => {
        const c = cells[y * size + x] ?? null;
        return c === 'first' ? 'X' : c === 'second' ? 'O' : '.';
      }).join(''),
    );
  }
  return rows.join('/');
}
