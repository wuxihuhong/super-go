/**
 * 识别端到端验证工具：截图 → YOLO 推理 → NMS → 盘面吸附 → FEN 输出。
 * 用法：node packages/app/scripts/yolo-verify.mjs <png 或 .rgba 路径>
 *   .rgba = SUPER_GO_LINKER_DIAG_DUMP 落盘的原始帧（尺寸取同名 .json 边车），
 *   用于离线复现真机上"识别掉子"的那一帧。
 * 模型取仓库根 engines/vision（与打包产物同源），路径按本文件位置解析。
 *
 * ⚠️ 本脚本内联复刻 app 内链路（源码是 TS，脚本里 import 不了），口径必须与
 * yolo/preprocess.ts + boardGeometry.ts 保持一致——包括**双线性**缩放
 * （此前这里用的是最近邻，注释却自称"同口径"）。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import * as ort from 'onnxruntime-node';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODEL_PATH = join(REPO_ROOT, 'engines', 'vision', 'yolov11.onnx');

const pngPath = process.argv[2];
if (pngPath === undefined) {
  console.error('用法：node packages/app/scripts/yolo-verify.mjs <png路径>');
  process.exit(2);
}

function loadImage(path) {
  if (path.endsWith('.rgba')) {
    const meta = JSON.parse(readFileSync(path.replace(/\.rgba$/, '.json'), 'utf8'));
    return {
      width: meta.width,
      height: meta.height,
      data: new Uint8ClampedArray(readFileSync(path)),
      note: meta.board === null ? 'recognizeFrame 拒帧' : `app 当时识别为 ${meta.board}`,
    };
  }
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

const img = loadImage(pngPath);
console.log(`image: ${img.width}x${img.height}`);
if (img.note !== undefined) console.log(`dump: ${img.note}`);

// ---- 与 app 内实现同口径的推理（直接 import 编译前源码不可行，这里内联同逻辑）----
const SIZE = 640;
const scale = SIZE / Math.max(img.width, img.height);
const contentW = Math.max(1, Math.round(img.width * scale));
const contentH = Math.max(1, Math.round(img.height * scale));
const padX = Math.floor((SIZE - contentW) / 2);
const padY = Math.floor((SIZE - contentH) / 2);
const data = new Float32Array(3 * SIZE * SIZE).fill(114 / 255);
const invScale = 1 / scale;
const clamp = (v, max) => (v < 0 ? 0 : v > max ? max : v);
// 双线性（像素中心对齐），与 yolo/preprocess.ts 同口径
for (let dy = 0; dy < contentH; dy++) {
  const fy = clamp((dy + 0.5) * invScale - 0.5, img.height - 1);
  const y0 = Math.floor(fy);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const wy = fy - y0;
  for (let dx = 0; dx < contentW; dx++) {
    const fx = clamp((dx + 0.5) * invScale - 0.5, img.width - 1);
    const x0 = Math.floor(fx);
    const x1 = Math.min(img.width - 1, x0 + 1);
    const wx = fx - x0;
    const dst = (padY + dy) * SIZE + (padX + dx);
    for (let c = 0; c < 3; c++) {
      const p00 = img.data[(y0 * img.width + x0) * 4 + c];
      const p01 = img.data[(y0 * img.width + x1) * 4 + c];
      const p10 = img.data[(y1 * img.width + x0) * 4 + c];
      const p11 = img.data[(y1 * img.width + x1) * 4 + c];
      const top = p00 + (p01 - p00) * wx;
      const bottom = p10 + (p11 - p10) * wx;
      data[c * SIZE * SIZE + dst] = (top + (bottom - top) * wy) / 255;
    }
  }
}

const session = await ort.InferenceSession.create(MODEL_PATH, { intraOpNumThreads: 2 });
const t0 = Date.now();
const out = await session.run({ images: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
const ms = Date.now() - t0;
const raw = out[session.outputNames[0]].data;
const anchors = out[session.outputNames[0]].dims[2];
console.log(`infer: ${ms.toFixed(0)}ms, anchors=${anchors}`);

// 解码
const LABELS = ['n','b','a','k','r','c','p','R','N','A','K','B','C','P','0'];
const dets = [];
for (let a = 0; a < anchors; a++) {
  let best = 0, bestC = -1;
  for (let c = 0; c < 15; c++) {
    const v = raw[(4 + c) * anchors + a];
    if (v > best) { best = v; bestC = c; }
  }
  if (bestC < 0 || best <= 0.5) continue;
  const cx = (raw[0 * anchors + a] - padX) / scale;
  const cy = (raw[1 * anchors + a] - padY) / scale;
  const w = raw[2 * anchors + a] / scale;
  const h = raw[3 * anchors + a] / scale;
  if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) continue;
  dets.push({ label: LABELS[bestC], score: best, cx, cy, w, h });
}
console.log(`detections (conf>0.5): ${dets.length}`);
for (const d of dets.slice(0, 40)) {
  console.log(`  ${d.label} score=${d.score.toFixed(2)} cx=${d.cx.toFixed(0)} cy=${d.cy.toFixed(0)} w=${d.w.toFixed(0)} h=${d.h.toFixed(0)}`);
}

// ---- NMS（按类贪心，IoU 0.45）----
function iou(a, b) {
  const ix = Math.max(0, Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2));
  const iy = Math.max(0, Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}
const byClass = new Map();
for (const d of dets) (byClass.get(d.label) ?? byClass.set(d.label, []).get(d.label)).push(d);
const kept = [];
for (const list of byClass.values()) {
  list.sort((x, y) => y.score - x.score);
  const dead = new Array(list.length).fill(false);
  for (let i = 0; i < list.length; i++) {
    if (dead[i]) continue;
    kept.push(list[i]);
    for (let j = i + 1; j < list.length; j++) if (!dead[j] && iou(list[i], list[j]) > 0.45) dead[j] = true;
  }
}
console.log(`after NMS: ${kept.length}`);

// ---- 棋盘框 → 粗网格 → 棋子中心拟合精修 → 吸附 → FEN（同 boardGeometry.ts 口径）----
let box = null;
for (const d of kept) {
  if (d.label !== '0') continue;
  if (box === null || d.w * d.h > box.w * box.h) box = { x: d.cx - d.w / 2, y: d.cy - d.h / 2, w: d.w, h: d.h };
}
if (box === null) { console.log('NO BOARD BOX'); process.exit(1); }
console.log(`board box: x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.w.toFixed(0)} h=${box.h.toFixed(0)}`);

/** 按网格吸附出 (col,row)，带框内 + 尺寸过滤（界面装饰误检防线） */
function pieceCells(grid) {
  const left = grid.ox - grid.sx / 2, top = grid.oy - grid.sy / 2;
  const out = [];
  for (const d of kept) {
    if (d.label === '0') continue;
    if (d.cx < left || d.cx > grid.ox + grid.sx * 8.5 || d.cy < top || d.cy > grid.oy + grid.sy * 9.5) continue;
    if (d.w < grid.sx * 0.45 || d.w > grid.sx * 1.7 || d.h < grid.sy * 0.45 || d.h > grid.sy * 1.7) continue;
    const col = Math.floor((d.cx - left) / grid.sx), row = Math.floor((d.cy - top) / grid.sy);
    if (col < 0 || col > 8 || row < 0 || row > 9) continue;
    out.push({ d, col, row });
  }
  return out;
}

function fit(idx, coord) {
  const n = idx.length;
  if (n < 6 || new Set(idx).size < 3 || Math.max(...idx) - Math.min(...idx) < 4) return null;
  const sx = idx.reduce((a, b) => a + b, 0), sy = coord.reduce((a, b) => a + b, 0);
  const sxx = idx.reduce((a, b) => a + b * b, 0), sxy = idx.reduce((a, b, k) => a + b * coord[k], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  return { step: slope, origin: (sy - slope * sx) / n };
}

const coarse = { ox: box.x, oy: box.y, sx: box.w / 8, sy: box.h / 9 };
const cells0 = pieceCells(coarse);
const fx = fit(cells0.map((c) => c.col), cells0.map((c) => c.d.cx));
const fy = fit(cells0.map((c) => c.row), cells0.map((c) => c.d.cy));
const refined = fx !== null && fy !== null
  && Math.abs(fx.step / coarse.sx - 1) <= 0.15 && Math.abs(fy.step / coarse.sy - 1) <= 0.15;
const grid = refined ? { ox: fx.origin, oy: fy.origin, sx: fx.step, sy: fy.step } : coarse;
console.log(`grid: refined=${refined} origin=(${grid.ox.toFixed(1)}, ${grid.oy.toFixed(1)}) step=${grid.sx.toFixed(2)}x${grid.sy.toFixed(2)}  [coarse step=${coarse.sx.toFixed(2)}x${coarse.sy.toFixed(2)}]`);

const board = new Array(90).fill(null);
const score = new Array(90).fill(-1);
for (const c of pieceCells(grid)) {
  const i = c.row * 9 + c.col;
  if (c.d.score > score[i]) { score[i] = c.d.score; board[i] = c.d.label; }
}
// 翻转检测
let redKingRow = -1, blackKingRow = -1;
for (let y = 0; y < 10; y++) for (let x = 3; x <= 5; x++) {
  if (board[y * 9 + x] === 'K') redKingRow = y;
  if (board[y * 9 + x] === 'k') blackKingRow = y;
}
let reversed = false;
if (redKingRow >= 0 && redKingRow <= 2) reversed = true;
else if (blackKingRow >= 0 && blackKingRow >= 7) reversed = true;
if (reversed) { const b2 = board.slice(); for (let i = 0; i < 90; i++) board[i] = b2[89 - i]; }
console.log(`reversed=${reversed}`);
const pieceCount = board.filter(Boolean).length;
console.log(`pieces on board: ${pieceCount}/32`);
const fenRows = [];
for (let y = 0; y < 10; y++) {
  let row = '', empty = 0;
  for (let x = 0; x < 9; x++) {
    const p = board[y * 9 + x];
    if (p) { row += empty ? String(empty) : ''; row += p; empty = 0; } else empty++;
  }
  if (empty) row += String(empty);
  fenRows.push(row);
}
const fen = `${fenRows.join('/')} w - - 0 1`;
console.log(`FEN: ${fen}`);
console.log(`expect: rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1`);
console.log(fen === 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1' ? '✅ IDENTICAL' : '❌ MISMATCH');
