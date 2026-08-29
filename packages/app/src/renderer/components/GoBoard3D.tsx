import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GoPosition, Point } from '@super-go/core';
import { cellAt } from '@super-go/core';
import type { GoHintPoint } from '@shared/game';
import { uniqueBestHint } from '@shared/goBestMove';
import { grooveLine } from '../lib/boardDraw';
import { drawHintLabel, hintDotVisual, hoshiPoints } from '../lib/goBoardDraw';
import { snapGridIndex } from '../lib/goSnap';
import { cssColor } from '../lib/theme';
import { useElementSize } from '../lib/useElementSize';

export interface GoBoard3DProps {
  position: GoPosition;
  lastPoint?: Point | null;
  hintPoints?: readonly GoHintPoint[];
  flip: boolean;
  themeTick: number;
  interactive: boolean;
  onPlay: (point: Point) => void;
  onUnavailable: () => void;
}

/** 19 路标准盘：格线区 + 边框（世界单位，对齐象棋 3D 的取景尺度） */
const GO_N = 19;
const MARGIN = 0.72;
const GRID = 10.8;
const BOARD = GRID + 2 * MARGIN;
const BOARD_H = 0.38;
const TEX = 4096;
const LOOK_Z = 0.2;
/** 盘体八角必须落在 NDC 此范围内，100% 时近沿/边角才不会被裁 */
const FRAME_NDC = 0.76;

function gridToWorld(x: number, y: number, n: number): THREE.Vector3 {
  const step = GRID / (n - 1);
  const origin = -GRID / 2;
  return new THREE.Vector3(origin + x * step, 0, origin + y * step);
}

function worldToGrid(hit: THREE.Vector3, n: number): Point | null {
  const step = GRID / (n - 1);
  const origin = -GRID / 2;
  const gx = snapGridIndex(hit.x, origin, step, n);
  const gy = snapGridIndex(hit.z, origin, step, n);
  if (gx === null || gy === null) return null;
  return { x: gx, y: gy };
}

/** 双凸透镜形棋子剖面（绕 Y 轴旋转） */
function makeGoStoneGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.98, 0.04),
    new THREE.Vector2(1, 0.12),
    new THREE.Vector2(0.92, 0.28),
    new THREE.Vector2(0.55, 0.42),
    new THREE.Vector2(0, 0.48),
  ];
  return new THREE.LatheGeometry(profile, 48);
}

function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 程序木纹（对齐象棋 3D：用不透明 --board-line + globalAlpha，避免 --board-grain 叠透明后等于没画） */
function paintWoodGrain(ctx: CanvasRenderingContext2D): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const hi = cssColor('--board-hi');
  const lo = cssColor('--board-lo');
  const line = cssColor('--board-line');
  const scale = W / 1040;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, hi);
  grad.addColorStop(1, lo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = line;
  for (let i = 0; i < 12; i++) {
    const bx = ((i + rnd(i) * 0.6) / 12) * W;
    ctx.globalAlpha = 0.08 + rnd(i + 20) * 0.06;
    ctx.lineWidth = (50 + rnd(i + 60) * 90) * scale;
    ctx.beginPath();
    ctx.moveTo(bx + Math.sin(i * 1.7) * 3, 0);
    ctx.bezierCurveTo(bx + 14 * scale, H * 0.33, bx - 14 * scale, H * 0.66, bx + Math.sin(i * 2.3) * 3, H);
    ctx.stroke();
  }
  const fines = W > 2000 ? 120 : 64;
  for (let i = 0; i < fines; i++) {
    const bx = rnd(i) * W;
    ctx.globalAlpha = 0.1 + rnd(i + 30) * 0.08;
    ctx.lineWidth = (0.8 + rnd(i + 70) * 1.8) * scale;
    ctx.beginPath();
    ctx.moveTo(bx + Math.sin(i) * 2, 0);
    ctx.bezierCurveTo(bx + 8 * scale, H * 0.33, bx - 8 * scale, H * 0.66, bx + Math.sin(i * 2.1) * 2, H);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const bx = rnd(i + 200) * W;
    ctx.globalAlpha = 0.14 + rnd(i + 210) * 0.07;
    ctx.lineWidth = (2.5 + rnd(i + 220) * 2.5) * scale;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.bezierCurveTo(bx + 10 * scale, H * 0.4, bx - 10 * scale, H * 0.7, bx + 4 * scale, H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  const sheen = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.9);
  sheen.addColorStop(0, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  const vign = ctx.createRadialGradient(W * 0.75, H * 0.85, 0, W * 0.75, H * 0.85, W * 0.8);
  vign.addColorStop(0, 'rgba(0,0,0,0.05)');
  vign.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function paintGoBoard(ctx: CanvasRenderingContext2D, n: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const hi = cssColor('--board-hi');
  const line = cssColor('--board-line');
  const hoshi = cssColor('--go-hoshi');
  const pad = Math.round((MARGIN / BOARD) * W);
  const inner = W - pad * 2;
  const cell = inner / (n - 1);
  paintWoodGrain(ctx);

  const lw = Math.max(3, Math.round(cell * 0.028));
  for (let i = 0; i < n; i++) {
    const a = pad + i * cell;
    grooveLine(ctx, pad, a, W - pad, a, line, hi, lw);
    grooveLine(ctx, a, pad, a, H - pad, line, hi, lw);
  }
  const inset = Math.round(cell * 0.14);
  const frameW = inner + inset * 2;
  grooveLine(ctx, pad - inset, pad - inset, pad - inset + frameW, pad - inset, line, hi, lw * 1.8);
  grooveLine(ctx, pad - inset, pad - inset + frameW, pad - inset + frameW, pad - inset + frameW, line, hi, lw * 1.8);
  grooveLine(ctx, pad - inset, pad - inset, pad - inset, pad - inset + frameW, line, hi, lw * 1.8);
  grooveLine(ctx, pad - inset + frameW, pad - inset, pad - inset + frameW, pad - inset + frameW, line, hi, lw * 1.8);

  ctx.fillStyle = hoshi;
  for (const h of hoshiPoints(n)) {
    ctx.beginPath();
    ctx.arc(pad + h.x * cell, pad + h.y * cell, Math.max(4, cell * 0.085), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = line;
  ctx.font = `600 ${Math.round(cell * 0.26)}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = 'ABCDEFGHJKLMNOPQRST';
  for (let i = 0; i < n; i++) {
    const a = pad + i * cell;
    const col = letters[i] ?? '';
    const row = String(n - i);
    ctx.fillText(col, a, pad * 0.42);
    ctx.fillText(col, a, H - pad * 0.42);
    ctx.fillText(row, pad * 0.42, a);
    ctx.fillText(row, W - pad * 0.42, a);
  }
}

function boardCorners(): THREE.Vector3[] {
  const h = BOARD / 2;
  return [
    new THREE.Vector3(-h, 0, -h),
    new THREE.Vector3(h, 0, -h),
    new THREE.Vector3(-h, 0, h),
    new THREE.Vector3(h, 0, h),
    new THREE.Vector3(-h, -BOARD_H, -h),
    new THREE.Vector3(h, -BOARD_H, -h),
    new THREE.Vector3(-h, -BOARD_H, h),
    new THREE.Vector3(h, -BOARD_H, h),
  ];
}

/** 把盘体八角收入取景，避免 100% 时近沿/边角被透视裁掉 */
function frameGoBoard(camera: THREE.PerspectiveCamera, flip: boolean): void {
  const sign = flip ? -1 : 1;
  const look = new THREE.Vector3(0, 0, LOOK_Z * sign);
  const dir = new THREE.Vector3(0, 1.85, sign).normalize();
  const corners = boardCorners();
  const ndc = new THREE.Vector3();
  camera.fov = 36;
  camera.near = 0.8;
  camera.far = 90;
  let chosen = 34;
  for (let dist = 24; dist <= 52; dist += 0.35) {
    camera.position.copy(dir).multiplyScalar(dist);
    camera.lookAt(look);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    let ok = true;
    for (const c of corners) {
      ndc.copy(c).project(camera);
      if (
        ndc.x < -FRAME_NDC ||
        ndc.x > FRAME_NDC ||
        ndc.y < -FRAME_NDC ||
        ndc.y > FRAME_NDC ||
        ndc.z <= 0 ||
        ndc.z >= 1
      ) {
        ok = false;
        break;
      }
    }
    if (ok) {
      chosen = dist;
      break;
    }
  }
  camera.position.copy(dir).multiplyScalar(chosen);
  camera.lookAt(look);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
}

interface GoSceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  stones: THREE.Group;
  hints: THREE.Group;
  rebuildHints: () => void;
  boardTex: THREE.CanvasTexture;
  boardCtx: CanvasRenderingContext2D;
  stoneGeo: THREE.LatheGeometry;
  blackMat: THREE.MeshPhysicalMaterial;
  whiteMat: THREE.MeshPhysicalMaterial;
  envTex: THREE.Texture;
  schedule: () => void;
  frameCamera: (flip: boolean) => void;
  rebuildStones: () => void;
  drawHintOverlay: () => void;
}

export default function GoBoard3D(props: GoBoard3DProps): React.JSX.Element {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const sceneRef = useRef<GoSceneHandle | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      propsRef.current.onUnavailable();
      return;
    }
    renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.8, 90);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.12);
    sun.position.set(6, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.28);
    fill.position.set(-6, 8, -8);
    scene.add(fill);

    const texCanvas = document.createElement('canvas');
    texCanvas.width = TEX;
    texCanvas.height = TEX;
    const boardCtx = texCanvas.getContext('2d', { alpha: false });
    if (boardCtx === null) {
      envTex.dispose();
      renderer.dispose();
      propsRef.current.onUnavailable();
      return;
    }
    paintGoBoard(boardCtx, GO_N);
    const boardTex = new THREE.CanvasTexture(texCanvas);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    boardTex.generateMipmaps = true;
    boardTex.minFilter = THREE.LinearMipmapLinearFilter;
    boardTex.magFilter = THREE.LinearFilter;
    boardTex.needsUpdate = true;

    const topMat = new THREE.MeshPhysicalMaterial({
      map: boardTex,
      roughness: 0.58,
      clearcoat: 0.12,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.07,
    });
    const sideCanvas = document.createElement('canvas');
    sideCanvas.width = 1024;
    sideCanvas.height = 256;
    const sideCtx = sideCanvas.getContext('2d', { alpha: false });
    if (sideCtx === null) {
      envTex.dispose();
      boardTex.dispose();
      renderer.dispose();
      propsRef.current.onUnavailable();
      return;
    }
    paintWoodGrain(sideCtx);
    const sideTex = new THREE.CanvasTexture(sideCanvas);
    sideTex.colorSpace = THREE.SRGBColorSpace;
    sideTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    sideTex.needsUpdate = true;
    const sideMat = new THREE.MeshPhysicalMaterial({
      map: sideTex,
      roughness: 0.5,
      clearcoat: 0.2,
      clearcoatRoughness: 0.45,
      envMapIntensity: 0.1,
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD, BOARD_H, BOARD), [
      sideMat,
      sideMat,
      topMat,
      sideMat,
      sideMat,
      sideMat,
    ]);
    board.position.y = -BOARD_H / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    scene.add(board);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -BOARD_H - 0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const stones = new THREE.Group();
    const hints = new THREE.Group();
    const hintGeo = new THREE.CircleGeometry(1, 32);
    scene.add(stones);
    scene.add(hints);
    let overlayCssW = 0;
    let overlayCssH = 0;
    let overlayDpr = 0;
    const stoneGeo = makeGoStoneGeometry();
    const blackMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cssColor('--stone-black')),
      roughness: 0.28,
      clearcoat: 0.22,
      envMapIntensity: 0.2,
    });
    const whiteMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cssColor('--stone-white')),
      roughness: 0.2,
      clearcoat: 0.38,
      envMapIntensity: 0.28,
    });

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent): void => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent): void => {
      if (downAt === null) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      const p = propsRef.current;
      if (!p.interactive || moved > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const aspect = rect.width / rect.height;
      if (Math.abs(camera.aspect - aspect) > 1e-4) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit) === null) return;
      const point = worldToGrid(hit, p.position.size);
      if (point !== null) p.onPlay(point);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const schedule = (): void => {
      renderer.render(scene, camera);
    };
    const frameCamera = (flip: boolean): void => {
      frameGoBoard(camera, flip);
    };
    const rebuildStones = (): void => {
      const p = propsRef.current;
      const pos = p.position;
      const n = pos.size;
      paintGoBoard(boardCtx, n);
      boardTex.needsUpdate = true;
      paintWoodGrain(sideCtx);
      sideTex.needsUpdate = true;
      blackMat.color.set(cssColor('--stone-black'));
      whiteMat.color.set(cssColor('--stone-white'));

      while (stones.children.length > 0) {
        const child = stones.children[0]!;
        stones.remove(child);
        if (child instanceof THREE.Mesh) {
          if (child.geometry !== stoneGeo) child.geometry.dispose();
          const mat = child.material;
          const extras = (Array.isArray(mat) ? mat : [mat]).filter(
            (m) => m !== blackMat && m !== whiteMat,
          );
          extras.forEach((m) => m.dispose());
        }
      }
      const step = GRID / (n - 1);
      const stoneR = step * 0.46;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const cell = cellAt(pos, { x, y });
          if (cell === null || cell === undefined) continue;
          const mesh = new THREE.Mesh(stoneGeo, cell === 'first' ? blackMat : whiteMat);
          const at = gridToWorld(x, y, n);
          mesh.position.set(at.x, 0.02, at.z);
          mesh.scale.set(stoneR, stoneR, stoneR);
          mesh.castShadow = true;
          stones.add(mesh);
          if (
            p.lastPoint !== undefined &&
            p.lastPoint !== null &&
            p.lastPoint.x === x &&
            p.lastPoint.y === y
          ) {
            const mark = new THREE.Mesh(
              new THREE.RingGeometry(stoneR * 0.28, stoneR * 0.4, 24),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(cssColor('--accent')),
                side: THREE.DoubleSide,
              }),
            );
            mark.rotation.x = -Math.PI / 2;
            mark.position.set(at.x, 0.16, at.z);
            stones.add(mark);
          }
        }
      }
      rebuildHints();
    };

    const clearHintMeshes = (): void => {
      while (hints.children.length > 0) {
        const child = hints.children[0]!;
        hints.remove(child);
        if (child instanceof THREE.Mesh) {
          const mat = child.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
        }
      }
    };

    const rebuildHints = (): void => {
      const p = propsRef.current;
      const pos = p.position;
      const n = pos.size;
      const step = GRID / (n - 1);
      const stoneR = step * 0.46;
      clearHintMeshes();
      const hintList = p.hintPoints ?? [];
      const bestHint = uniqueBestHint(hintList);
      for (const hint of hintList) {
        if (cellAt(pos, hint.point) !== null) continue;
        if (
          p.lastPoint !== undefined &&
          p.lastPoint !== null &&
          p.lastPoint.x === hint.point.x &&
          p.lastPoint.y === hint.point.y
        ) {
          continue;
        }
        const at = gridToWorld(hint.point.x, hint.point.y, n);
        const vis = hintDotVisual(stoneR, hint, bestHint);
        const disc = new THREE.Mesh(
          hintGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vis.color),
            transparent: true,
            opacity: vis.alpha,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(at.x, 0.08, at.z);
        disc.scale.setScalar(vis.radius);
        hints.add(disc);
      }
      schedule();
      drawHintOverlay();
    };

    const drawHintOverlay = (): void => {
      const canvas = overlayRef.current;
      if (canvas === null) return;
      const rect = host.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (cssW !== overlayCssW || cssH !== overlayCssH || dpr !== overlayDpr) {
        overlayCssW = cssW;
        overlayCssH = cssH;
        overlayDpr = dpr;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const p = propsRef.current;
      const pos = p.position;
      const n = pos.size;
      const step = GRID / (n - 1);
      const ndc = new THREE.Vector3();
      const neighbor = new THREE.Vector3();
      const overlayHints = p.hintPoints ?? [];
      const overlayBest = uniqueBestHint(overlayHints);
      for (const hint of overlayHints) {
        if (cellAt(pos, hint.point) !== null) continue;
        if (hint.faint) continue;
        const vis = hintDotVisual(1, hint, overlayBest);
        if (!vis.good) continue;
        const at = gridToWorld(hint.point.x, hint.point.y, n);
        ndc.set(at.x, 0.1, at.z).project(camera);
        if (ndc.z < -1 || ndc.z > 1) continue;
        const sx = (ndc.x * 0.5 + 0.5) * cssW;
        const sy = (-ndc.y * 0.5 + 0.5) * cssH;
        neighbor.set(at.x + step, 0.1, at.z).project(camera);
        const screenR = Math.abs((neighbor.x - ndc.x) * 0.5 * cssW) * 0.46;
        drawHintLabel(ctx, sx, sy, Math.max(8, screenR), hint, vis.good);
      }
    };

    const handle: GoSceneHandle = {
      renderer,
      scene,
      camera,
      stones,
      hints,
      rebuildHints,
      boardTex,
      boardCtx,
      stoneGeo,
      blackMat,
      whiteMat,
      envTex,
      schedule,
      frameCamera,
      rebuildStones,
      drawHintOverlay,
    };
    sceneRef.current = handle;
    frameCamera(propsRef.current.flip);
    rebuildStones();

    return () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      clearHintMeshes();
      hintGeo.dispose();
      stoneGeo.dispose();
      board.geometry.dispose();
      topMat.dispose();
      sideMat.dispose();
      blackMat.dispose();
      whiteMat.dispose();
      boardTex.dispose();
      sideTex.dispose();
      envTex.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (s === null || width <= 0 || height <= 0) return;
    s.renderer.setSize(width, height, false);
    s.camera.aspect = width / height;
    s.frameCamera(propsRef.current.flip);
    s.schedule();
    s.drawHintOverlay();
  }, [width, height]);

  useEffect(() => {
    const s = sceneRef.current;
    if (s === null) return;
    s.frameCamera(props.flip);
    s.schedule();
    s.drawHintOverlay();
  }, [props.flip]);

  useEffect(() => {
    sceneRef.current?.rebuildStones();
  }, [props.position, props.lastPoint, props.themeTick]);

  useEffect(() => {
    sceneRef.current?.rebuildHints();
  }, [props.hintPoints]);

  return (
    <div ref={ref} className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
