/**
 * 前台鼠标注入：nut.js（真实移动系统鼠标；mac 唯一途径，Windows 前台模式共用）。
 * 参考系 = 窗口外框（nut.js region，屏幕逻辑坐标/DIP）。
 */
import { Button, mouse, Point } from '@nut-tree/nut-js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function pointerClick(
  screenX: number,
  screenY: number,
  holdMs: number,
): Promise<void> {
  const target = new Point(Math.round(screenX), Math.round(screenY));
  const origin = await mouse.getPosition();
  await mouse.setPosition(target);
  await mouse.pressButton(Button.LEFT);
  if (holdMs > 0) await sleep(holdMs);
  await mouse.releaseButton(Button.LEFT);
  // 鼠标归位：避免连线期间指针停在对方棋盘上触发悬停效果
  await mouse.setPosition(origin);
}

export async function pointerPosition(): Promise<{ x: number; y: number }> {
  const p = await mouse.getPosition();
  return { x: p.x, y: p.y };
}
