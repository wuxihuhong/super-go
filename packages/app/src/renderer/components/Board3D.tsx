import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { pieceAt, pieceChar, pieceSide, type Point, type XiangqiPosition } from '@super-go/core';
import { cannonPawnPoints, cornerMarks, drawMoveArrow, grooveLine } from '../lib/boardDraw';
import { cssColor } from '../lib/theme';
import { useElementSize } from '../lib/useElementSize';

export interface Board3DProps {
  position: XiangqiPosition;
  selected: Point | null;
  targets: readonly Point[];
  lastMove: { from: Point; to: Point } | null;
  checkedKing: Point | null;
  flip: boolean;
  themeTick: number;
  onSquareClick: (x: number, y: number) => void;
  /** WebGL 初始化失败时通知上层回退 2D */
  onUnavailable: () => void;
}

/**
 * 真 3D 透视棋盘（Three.js，观感对齐收藏级实木棋具）：
 * - 几何对齐铁律：盘体 = 格线区(8×9) + 两侧各 1.2 单位宽框带，贴图按 100px/单位
 *   精确绘制 → 格线交叉点与棋子世界坐标一一对应。
 * - 材质：车削轮廓棋子（LatheGeometry）+ 阴刻字顶盘 + clearcoat 清漆 +
 *   RoomEnvironment 环境反射 + 实时软阴影（棋影落盘、盘影落地）。
 * - 盘面：多层程序木纹 + 刻线凹槽光影 + 炮/兵位折角标记（传统盘面）。
 * 拖拽旋转（限制俯仰）、滚轮缩放、点击拾取落子；颜色全走语义 token。
 */

const MARGIN = 1.2; // 格线区外的框带宽度（世界单位）
const BOARD_W = 8 + 2 * MARGIN; // 10.4
const BOARD_D = 9 + 2 * MARGIN; // 11.4
const BOARD_H = 0.38;
const PXU = 100; // 盘面贴图：像素 / 世界单位
// 网格 → 世界坐标：文件 x 0-8 → X -4..4；行 y 0(黑顶)-9(红底) → Z -4.5..4.5
const FX = (f: number): number => f - 4;
const RZ = (r: number): number => r - 4.5;

/** 车削棋子轮廓（半径, 高度）：小足 → 鼓腰 → 收肩，顶面另盖刻字盘 */
const PIECE_PROFILE: [number, number][] = [
  [0.38, 0.0],
  [0.43, 0.02],
  [0.452, 0.065],
  [0.46, 0.12],
  [0.448, 0.168],
  [0.42, 0.203],
  [0.372, 0.226],
  [0.3, 0.235],
];
const FACE_R = 0.3;

export default function Board3D(props: Board3DProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const glRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    boardCtx: CanvasRenderingContext2D;
    boardTex: THREE.CanvasTexture;
    sideMat: THREE.MeshPhysicalMaterial;
    pieceGroup: THREE.Group;
    /** 棋子材质缓存（键：piece + 主题） */
    matCache: Map<string, THREE.MeshPhysicalMaterial>;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // ---- 初始化（一次） ----
  useEffect(() => {
    const host = glRef.current;
    if (host === null) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      props.onUnavailable();
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 11.4, 12.4);

    // 环境反射（清漆质感的前提）+ 三点光
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(6, 13, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-6, 8, -8);
    scene.add(fill);

    // 盘体贴图画布（1040×1140 = 盘体顶面 @100px/单位）
    const texCanvas = document.createElement('canvas');
    texCanvas.width = BOARD_W * PXU;
    texCanvas.height = BOARD_D * PXU;
    const boardCtx = texCanvas.getContext('2d');
    if (boardCtx === null) {
      envTex.dispose();
      renderer.dispose();
      props.onUnavailable();
      return;
    }
    const boardTex = new THREE.CanvasTexture(texCanvas);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    boardTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const boardMat = new THREE.MeshPhysicalMaterial({
      map: boardTex,
      roughness: 0.5,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.55,
    });
    const sideMat = new THREE.MeshPhysicalMaterial({
      color: cssColor('--board-frame'),
      roughness: 0.45,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.7,
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_D), [
      sideMat,
      sideMat,
      boardMat, // +y 顶面
      sideMat,
      sideMat,
      sideMat,
    ]);
    board.position.y = -BOARD_H / 2;
    board.castShadow = true;
    board.receiveShadow = true;
    scene.add(board);

    // 接地投影面（盘影落在虚拟桌面上）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -BOARD_H - 0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const pieceGroup = new THREE.Group();
    scene.add(pieceGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.25;
    controls.rotateSpeed = 0.55;
    controls.target.set(0, 0, 0.4);

    // 点击拾取（拖动距离小才算点击；拾取平面 = 盘面 y=0）
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
      if (moved > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit) === null) return;
      const f = Math.round(hit.x + 4);
      const r = Math.round(hit.z + 4.5);
      if (f < 0 || f > 8 || r < 0 || r > 9) return;
      propsRef.current.onSquareClick(f, r);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // 共享几何（车削轮廓 + 顶面刻字盘；模块级单例，cleanup 释放）
    bodyGeometry();
    topGeometry();

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      boardCtx,
      boardTex,
      sideMat,
      pieceGroup,
      matCache: new Map(),
    };

    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      const s = sceneRef.current;
      if (s !== null) {
        for (const m of s.matCache.values()) {
          m.map?.dispose();
          m.bumpMap?.dispose();
          m.dispose();
        }
      }
      controls.dispose();
      bodyGeometry().dispose();
      bodyGeomSingleton = null;
      topGeometry().dispose();
      topGeomSingleton = null;
      board.geometry.dispose();
      boardMat.dispose();
      sideMat.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      boardTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // 初始化只跑一次：场景装配依赖仅 ref 与回调包装，props 经 propsRef 读取
  }, []);

  // ---- 尺寸 ----
  useEffect(() => {
    const gl = sceneRef.current;
    if (gl === null || width <= 0 || height <= 0) return;
    gl.renderer.setSize(width, height, false);
    gl.camera.aspect = width / height;
    gl.camera.updateProjectionMatrix();
  }, [width, height]);

  // ---- 视角（执方/翻转：相机在用户一侧） ----
  useEffect(() => {
    const gl = sceneRef.current;
    if (gl === null) return;
    gl.camera.position.set(0, 11.4, props.flip ? -12.4 : 12.4);
    gl.controls.target.set(0, 0, props.flip ? -0.4 : 0.4);
    gl.controls.update();
  }, [props.flip]);

  // ---- 盘面纹理（木纹 + 刻线 + 传统标记；随局面/主题重绘） ----
  useEffect(() => {
    const gl = sceneRef.current;
    if (gl === null) return;
    paintBoardTexture(gl.boardCtx, props);
    gl.boardTex.needsUpdate = true;
    gl.sideMat.color.set(cssColor('--board-frame'));
  }, [props, props.themeTick]);

  // ---- 棋子（车削实体 + 刻字顶盘，按主题缓存材质） ----
  useEffect(() => {
    const gl = sceneRef.current;
    if (gl === null) return;
    const { pieceGroup, matCache } = gl;
    pieceGroup.clear();
    const dark = document.documentElement.classList.contains('theme-dark');
    const sideMat = cachedPieceSideMaterial(matCache, dark);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const piece = pieceAt(props.position, x, y);
        if (piece === null) continue;
        const g = new THREE.Group();
        const body = new THREE.Mesh(bodyGeometry(), sideMat);
        const cap = new THREE.Mesh(topGeometry(), cachedFaceMaterial(matCache, piece, dark));
        body.castShadow = true;
        cap.castShadow = true;
        g.add(body, cap);
        g.position.set(FX(x), 0, RZ(y));
        if (props.flip) g.rotation.y = Math.PI; // 字面朝向行棋方
        pieceGroup.add(g);
      }
    }
  }, [props.position, props.flip, props.themeTick]);

  return (
    <div ref={ref} className="relative h-full w-full">
      <div ref={glRef} className="absolute inset-0" />
    </div>
  );
}

// ---- 共享几何单例（组件卸载由初始化 effect 的 cleanup 释放） ----
let bodyGeomSingleton: THREE.LatheGeometry | null = null;
let topGeomSingleton: THREE.CircleGeometry | null = null;
function bodyGeometry(): THREE.LatheGeometry {
  bodyGeomSingleton ??= new THREE.LatheGeometry(
    PIECE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    56,
  );
  return bodyGeomSingleton;
}
function topGeometry(): THREE.CircleGeometry {
  if (topGeomSingleton === null) {
    topGeomSingleton = new THREE.CircleGeometry(FACE_R, 48);
    topGeomSingleton.rotateX(-Math.PI / 2);
  }
  return topGeomSingleton;
}

/** 确定性伪随机（木纹噪声用，避免每次重绘纹理跳动） */
function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 棋子侧面材质：车削环纹木面 + 清漆 */
function cachedPieceSideMaterial(
  cache: Map<string, THREE.MeshPhysicalMaterial>,
  dark: boolean,
): THREE.MeshPhysicalMaterial {
  const key = `side-${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const hi = cssColor('--piece-face-hi');
  const lo = cssColor('--piece-face-lo');
  const grain = cssColor('--piece-emboss');
  ctx.fillStyle = lo;
  ctx.fillRect(0, 0, 256, 256);
  // 横向车削环纹（v 沿轮廓高度 → 恒 v 条带 = 围绕盘身的环）
  ctx.strokeStyle = grain;
  for (let i = 0; i < 26; i++) {
    const y0 = (i / 26) * 256 + rnd(i) * 4;
    ctx.globalAlpha = 0.05 + rnd(i + 40) * 0.08;
    ctx.lineWidth = 0.8 + rnd(i + 80) * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const y = y0 + Math.sin(x * 0.05 + i * 1.3) * 1.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 明暗过渡（v 方向：底部略暗）
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, hi);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.42,
    clearcoat: 1.0,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.85,
  });
  cache.set(key, mat);
  return mat;
}

/** 棋子顶面材质：车削纹 + 阴刻字（颜色版 + 高度版贴图） */
function cachedFaceMaterial(
  cache: Map<string, THREE.MeshPhysicalMaterial>,
  piece: Parameters<typeof pieceChar>[0],
  dark: boolean,
): THREE.MeshPhysicalMaterial {
  const key = `${piece}-${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const S = 256;
  const c = {
    faceHi: cssColor('--piece-face-hi'),
    faceLo: cssColor('--piece-face-lo'),
    rim: cssColor('--piece-rim'),
    red: cssColor('--piece-red'),
    black: cssColor('--piece-black'),
    emboss: cssColor('--piece-emboss'),
  };
  // ---- 颜色贴图 ----
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(S * 0.42, S * 0.4, S * 0.1, S / 2, S / 2, S * 0.62);
  grad.addColorStop(0, c.faceHi);
  grad.addColorStop(1, c.faceLo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  // 车削同心环（细密弧纹）
  for (let i = 0; i < 30; i++) {
    const r = 22 + i * 3.6;
    ctx.globalAlpha = 0.03 + rnd(i) * 0.035;
    ctx.strokeStyle = i % 2 === 0 ? c.emboss : c.faceHi;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 外缘双刻环（深槽 + 受光边）
  for (const [r, w] of [
    [S * 0.455, 4],
    [S * 0.415, 2],
  ] as const) {
    ctx.strokeStyle = c.rim;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.faceHi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r + w * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // ---- 高度贴图（bump：刻字凹陷、环槽、中央微凸） ----
  const bump = document.createElement('canvas');
  bump.width = S;
  bump.height = S;
  const btx = bump.getContext('2d')!;
  btx.fillStyle = '#808080';
  btx.fillRect(0, 0, S, S);
  const dome = btx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
  dome.addColorStop(0, '#9a9a9a');
  dome.addColorStop(1, '#808080');
  btx.fillStyle = dome;
  btx.fillRect(0, 0, S, S);
  for (const [r, depth] of [
    [S * 0.455, '#3c3c3c'],
    [S * 0.415, '#5a5a5a'],
  ] as const) {
    btx.strokeStyle = depth;
    btx.lineWidth = 4;
    btx.beginPath();
    btx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    btx.stroke();
  }
  // ---- 阴刻字：受光下缘高光 → 主色字 → 上缘暗影 ----
  const char = pieceChar(piece);
  const font = `600 ${S * 0.5}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
  const drawChar = (
    tctx: CanvasRenderingContext2D,
    color: string,
    dx: number,
    dy: number,
    alpha = 1,
  ): void => {
    tctx.save();
    tctx.globalAlpha = alpha;
    tctx.fillStyle = color;
    tctx.font = font;
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.fillText(char, S / 2 + dx, S / 2 + dy);
    tctx.restore();
  };
  drawChar(ctx, c.faceHi, 2.2, 2.6, 0.5); // 凹槽受光下缘
  drawChar(ctx, pieceSide(piece) === 'first' ? c.red : c.black, 0, 0);
  drawChar(btx, '#181818', 0, 0); // 凹陷

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpTex = new THREE.CanvasTexture(bump);
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bumpTex,
    bumpScale: 0.5,
    roughness: 0.38,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.9,
  });
  cache.set(key, mat);
  return mat;
}

/** 盘面纹理：程序木纹 + 刻线凹槽 + 传统盘面标记 + 对局标记 */
function paintBoardTexture(ctx: CanvasRenderingContext2D, props: Board3DProps): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const c = {
    hi: cssColor('--board-hi'),
    lo: cssColor('--board-lo'),
    grain: cssColor('--board-grain'),
    line: cssColor('--board-line'),
    river: cssColor('--board-river-text'),
    label: cssColor('--board-label'),
    accent: cssColor('--accent'),
    danger: cssColor('--danger'),
  };

  // ---- 木纹基底：对角渐变 + 宽年轮条带 + 细纹 + 长深纹 + 光泽 ----
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, c.hi);
  grad.addColorStop(1, c.lo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = c.grain;
  for (let i = 0; i < 12; i++) {
    const bx = ((i + rnd(i) * 0.6) / 12) * W;
    ctx.globalAlpha = 0.03 + rnd(i + 20) * 0.04;
    ctx.lineWidth = 50 + rnd(i + 60) * 90;
    ctx.beginPath();
    ctx.moveTo(bx + Math.sin(i * 1.7) * 3, 0);
    ctx.bezierCurveTo(bx + 14, H * 0.33, bx - 14, H * 0.66, bx + Math.sin(i * 2.3) * 3, H);
    ctx.stroke();
  }
  for (let i = 0; i < 64; i++) {
    const bx = rnd(i) * W;
    ctx.globalAlpha = 0.04 + rnd(i + 30) * 0.07;
    ctx.lineWidth = 0.8 + rnd(i + 70) * 1.8;
    ctx.beginPath();
    ctx.moveTo(bx + Math.sin(i) * 2, 0);
    ctx.bezierCurveTo(bx + 8, H * 0.33, bx - 8, H * 0.66, bx + Math.sin(i * 2.1) * 2, H);
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const bx = rnd(i + 200) * W;
    ctx.globalAlpha = 0.1 + rnd(i + 210) * 0.06;
    ctx.lineWidth = 2.5 + rnd(i + 220) * 2.5;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.bezierCurveTo(bx + 10, H * 0.4, bx - 10, H * 0.7, bx + 4, H);
    ctx.stroke();
  }
  ctx.restore();
  // 光泽（左上受光 + 右下暗角）
  ctx.save();
  const sheen = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.9);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  const vign = ctx.createRadialGradient(W * 0.75, H * 0.85, 0, W * 0.75, H * 0.85, W * 0.8);
  vign.addColorStop(0, 'rgba(0,0,0,0.05)');
  vign.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // ---- 几何（贴图 @100px/单位，与棋子世界坐标精确对齐） ----
  const cell = PXU;
  const px = (f: number): number => (MARGIN + f) * PXU;
  const py = (r: number): number => (MARGIN + r) * PXU;
  const P = (p: Point): { x: number; y: number } => ({
    x: px(props.flip ? 8 - p.x : p.x),
    y: py(props.flip ? 9 - p.y : p.y),
  });

  // ---- 刻线（深色主槽 + 受光高光偏移） ----
  const gl = (x1: number, y1: number, x2: number, y2: number, w = 3.2): void =>
    grooveLine(ctx, x1, y1, x2, y2, c.line, c.hi, w);
  for (let r = 0; r < 10; r++) gl(px(0), py(r), px(8), py(r));
  for (let f = 0; f < 9; f++) {
    if (f === 0 || f === 8) gl(px(f), py(0), px(f), py(9));
    else {
      gl(px(f), py(0), px(f), py(4));
      gl(px(f), py(5), px(f), py(9));
    }
  }
  for (const [x1, y1, x2, y2] of [
    [3, 0, 5, 2],
    [5, 0, 3, 2],
    [3, 7, 5, 9],
    [5, 7, 3, 9],
  ] as const) {
    gl(px(x1), py(y1), px(x2), py(y2), 2.6);
  }
  // 外围传统双粗框
  const inset = 0.16 * PXU;
  const grooveRect = (x: number, y: number, w: number, h: number, lw: number): void => {
    gl(x, y, x + w, y, lw);
    gl(x, y + h, x + w, y + h, lw);
    gl(x, y, x, y + h, lw);
    gl(x + w, y, x + w, y + h, lw);
  };
  grooveRect(px(0) - inset, py(0) - inset, cell * 8 + inset * 2, cell * 9 + inset * 2, 7);
  grooveRect(
    px(0) - inset * 0.4,
    py(0) - inset * 0.4,
    cell * 8 + inset * 0.8,
    cell * 9 + inset * 0.8,
    2.4,
  );

  // ---- 炮位/兵位折角标记（传统盘面，几何对称 flip 无需变换） ----
  for (const pt of cannonPawnPoints()) {
    cornerMarks(
      ctx,
      px(pt.x),
      py(pt.y),
      cell,
      c.line,
      pt.edge === null
        ? { left: true, right: true }
        : pt.edge === 'left'
          ? { left: false, right: true }
          : { left: true, right: false },
    );
  }

  // ---- 阴刻文字（楚河汉界 / 边沿编号）：受光下缘 + 深色主字 ----
  const carved = (text: string, x: number, y: number, size: number, color: string): void => {
    ctx.save();
    ctx.font = `${size}px 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = c.hi;
    ctx.fillText(text, x + 1.8, y + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };
  const riverY = (py(4) + py(5)) / 2;
  carved('楚 河', (px(0) + px(2)) / 2, riverY, cell * 0.44, c.river);
  carved('漢 界', (px(6) + px(8)) / 2, riverY, cell * 0.44, c.river);

  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const bandY1 = MARGIN * 0.42 * PXU; // 框带外半侧（避开最外排棋子）
  const bandY2 = H - MARGIN * 0.42 * PXU;
  // 浅色木框带 → 深褐刻字（--board-label 是深框用的奶白色，此处不可见）
  for (let i = 0; i < 9; i++) {
    const blackVal = props.flip ? 9 - i : i + 1;
    const redVal = props.flip ? i + 1 : 9 - i;
    const topIsRed = props.flip;
    carved(
      topIsRed ? (CN[redVal - 1] ?? '') : String(blackVal),
      px(i),
      bandY1,
      cell * 0.36,
      c.line,
    );
    carved(
      topIsRed ? String(blackVal) : (CN[redVal - 1] ?? ''),
      px(i),
      bandY2,
      cell * 0.36,
      c.line,
    );
  }

  // ---- 对局标记（画在刻线之上） ----
  if (props.lastMove !== null) {
    const from = P(props.lastMove.from);
    const to = P(props.lastMove.to);
    drawMoveArrow(ctx, from.x, from.y, to.x, to.y, cell, c.accent);
  }
  if (props.checkedKing !== null) {
    const k = P(props.checkedKing);
    ctx.save();
    ctx.strokeStyle = c.danger;
    ctx.lineWidth = cell * 0.06;
    ctx.beginPath();
    ctx.arc(k.x, k.y, cell * 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = c.accent;
  ctx.strokeStyle = c.accent;
  for (const t of props.targets) {
    const p = P(t);
    const occupied = pieceAt(props.position, t.x, t.y) !== null;
    ctx.beginPath();
    if (occupied) {
      ctx.lineWidth = cell * 0.05;
      ctx.arc(p.x, p.y, cell * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.arc(p.x, p.y, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  if (props.selected !== null) {
    const s = P(props.selected);
    ctx.save();
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = cell * 0.07;
    ctx.beginPath();
    ctx.arc(s.x, s.y, cell * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
