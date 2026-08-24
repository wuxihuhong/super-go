/**
 * 浏览器开发模式的 window.superGo 模拟（仅 DEV 注入，见 main.tsx）。
 *
 * 浏览器安全沙箱不能起本地进程/任意读文件——Pikafish 起不了，
 * 所以这里用 @super-go/core 在页面里真跑规则（落子/将军/终局全是真逻辑），
 * 引擎应招用「材料评估加权的随机合法着」模拟，评估/思考帧照常推送，
 * 让胜率条、着法列表、复盘等全部 UI 状态可离线调试。
 * 真实引擎通路（UCI 子进程）仍在 Electron 内验证（vitest 集成测试覆盖）。
 */
import {
  chessStrengthFromConfig,
  GameStateMachine,
  isInCheck,
  MoveTree,
  moveToIccs,
  normalizeXiangqiStrength,
  pieceAt,
  pieceTypeOf,
  pieceSide,
  XiangqiGame,
  type EngineSide,
  type GameResult,
  type Player,
  type XiangqiMove,
  type XiangqiPosition,
} from '@super-go/core';
import type { AppSettings, EngineStatusPayload, SuperGoApi, ThemeSetting } from '@shared/ipc';
import type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from '@shared/game';

/** 子力价值（厘兵），mock 材料评估用 */
const PIECE_CP: Record<string, number> = {
  K: 10000,
  R: 900,
  N: 400,
  C: 450,
  A: 200,
  B: 200,
  P: 100,
};

const SETTINGS_KEY = 'super-go.mock.settings';

export function installMockApi(): void {
  (window as { superGo?: SuperGoApi }).superGo = createMockApi();
  console.info('[mock] 浏览器开发模式：window.superGo 为模拟实现（无真实引擎）');
}

function createMockApi(): SuperGoApi {
  const game = new XiangqiGame();
  let tree = new MoveTree<XiangqiMove, XiangqiPosition>(game);
  const state = new GameStateMachine('xiangqi');
  let thinking = false;
  let paused = false;
  /** 终局悔棋复活用：end 清空 state 前留底执方 */
  let lastEngineSide: EngineSide = 'second';
  let generation = 0;

  const snapshotListeners = new Set<(snap: GameSnapshot) => void>();
  const statusListeners = new Set<(payload: EngineStatusPayload) => void>();
  const evalListeners = new Set<(evaluation: LiveEval) => void>();
  const themeListeners = new Set<(dark: boolean) => void>();

  // ---- 设置（localStorage 持久化；主题用 class 覆盖，无 nativeTheme）----
  let settings: AppSettings = loadSettings();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const effectiveDark = (): boolean =>
    settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
  const applyThemeClass = (): void => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', settings.theme === 'dark');
    root.classList.toggle('theme-light', settings.theme === 'light');
  };
  const notifyTheme = (): void => {
    for (const cb of themeListeners) cb(effectiveDark());
  };
  applyThemeClass();
  media.addEventListener('change', () => {
    if (settings.theme === 'system') notifyTheme();
  });

  // ---- 快照 ----
  const positionNow = (): XiangqiPosition => tree.positionOf(tree.cursor);

  const buildSnapshot = (): GameSnapshot => {
    const path = tree.pathOf(tree.cursor);
    const items: MainlineItem[] = [];
    let notationPos = tree.positionOf(path[0]!);
    for (let i = 1; i < path.length; i++) {
      const node = path[i]!;
      const side: Player = i % 2 === 1 ? 'first' : 'second';
      const record = node.evalRecord;
      const flip = side === 'first' ? 1 : -1;
      const cp = record !== undefined && record.score.kind === 'cp' ? record.score : undefined;
      items.push({
        nodeId: node.id,
        iccs: moveToIccs(node.move!),
        notation: game.moveToNotation(notationPos, node.move!),
        redCp: cp === undefined ? undefined : cp.value * flip,
        redMate: cp?.mate === undefined ? undefined : cp.mate * flip,
        depth: record?.depth,
      });
      notationPos = tree.positionOf(node);
    }
    const pos = positionNow();
    const snap = state.snapshot;
    let redCp: number | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]!.redCp !== undefined) {
        redCp = items[i]!.redCp;
        break;
      }
    }
    return {
      phase: snap.phase,
      engineSide: snap.engineSide,
      strengthLabel: snap.strength === null ? null : snap.strength.label,
      result: snap.result,
      turn: pos.turn,
      fen: game.serialize(pos),
      moves: items,
      cursorNodeId: tree.cursor.id,
      paused,
      thinking,
      inCheck: isInCheck(pos, pos.turn),
      lastMove:
        tree.cursor.move === null ? null : { from: tree.cursor.move.from, to: tree.cursor.move.to },
      redCp,
    };
  };

  const pushSnapshot = (): void => {
    const snap = buildSnapshot();
    for (const cb of snapshotListeners) cb(snap);
  };

  const pushStatus = (status: EngineStatusPayload['status']): void => {
    for (const cb of statusListeners) cb({ status, name: 'Mock Engine 1800' });
  };

  // ---- 模拟引擎 ----
  const materialRedCp = (pos: XiangqiPosition): number => {
    let value = 0;
    for (const piece of pos.board) {
      if (piece === null) continue;
      const cp = PIECE_CP[pieceTypeOf(piece)] ?? 0;
      value += pieceSide(piece) === 'first' ? cp : -cp;
    }
    return value;
  };

  const fakeEngineTurn = (): void => {
    const gen = ++generation;
    thinking = true;
    pushStatus('thinking');
    pushSnapshot();
    const pos = positionNow();
    const moves = game.legalMoves(pos);
    if (moves.length === 0) {
      thinking = false;
      finishIfOver();
      pushSnapshot();
      return;
    }
    // 思考帧（模拟深度推进）
    const frames = 3;
    for (let i = 1; i <= frames; i++) {
      setTimeout(
        () => {
          if (gen !== generation) return;
          for (const cb of evalListeners) {
            cb({ redCp: materialRedCp(pos) + (i % 2 === 0 ? 12 : -8), depth: 8 + i * 3 });
          }
        },
        (600 / frames) * i,
      );
    }
    setTimeout(
      () => {
        if (gen !== generation) return;
        const choice = pickMove(pos, moves);
        const node = tree.play(choice);
        const flip = pos.turn === 'first' ? 1 : -1;
        node.evalRecord = {
          score: { kind: 'cp', value: materialRedCp(positionNow()) * flip },
          depth: 8 + frames * 3,
          source: 'Mock Engine',
        };
        thinking = false;
        finishIfOver();
        pushStatus('ready');
        pushSnapshot();
        if (!paused && state.phase === 'playing' && engineToMoveNow()) fakeEngineTurn(); // 互搏续走
      },
      600 + Math.random() * 600,
    );
  };

  const finishIfOver = (): void => {
    if (state.phase !== 'playing') return;
    const pos = positionNow();
    const result: GameResult | null = game.isGameOver(pos, [pos]);
    if (result !== null) state.end(result);
  };

  /** 当前是否轮到引擎（含互搏） */
  const engineToMoveNow = (): boolean => {
    const side = state.engineSide;
    return side === 'both' || side === positionNow().turn;
  };

  const guardPlaying = (): IntentResult | null => {
    if (state.phase !== 'playing') return { ok: false, error: '对局未在进行中' };
    return null;
  };

  return {
    getAppInfo: () =>
      Promise.resolve({
        versions: { app: '0.0.1-mock', electron: '-', node: '-', chrome: chromeVersion() },
        platform: navigator.platform,
      }),
    getSettings: () => Promise.resolve({ ...settings }),
    setSettings: (patch) => {
      settings = {
        ...settings,
        ...patch,
        view: { board3d: true, alwaysOnTop: false, ...settings.view, ...patch.view },
        xiangqi: { ponder: false, ...settings.xiangqi, ...patch.xiangqi },
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      applyThemeClass();
      notifyTheme();
      return Promise.resolve(JSON.parse(JSON.stringify(settings)) as AppSettings);
    },
    onThemeChanged: (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },

    newGame: (intent: NewGameIntent) => {
      generation++;
      thinking = false;
      paused = false;
      if (state.phase === 'playing') state.abort();
      if (!intent.fromCursor) tree = new MoveTree<XiangqiMove, XiangqiPosition>(game);
      const profile = chessStrengthFromConfig(normalizeXiangqiStrength(settings.xiangqi?.strength));
      state.start({ engineSide: intent.engineSide, strength: profile });
      lastEngineSide = intent.engineSide;
      pushStatus('ready');
      pushSnapshot();
      if (engineToMoveNow()) fakeEngineTurn();
      return Promise.resolve({ ok: true });
    },
    playMove: (intent: PlayMoveIntent) => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      if (thinking) return Promise.resolve({ ok: false, error: '引擎思考中' });
      if (state.engineSide === 'both') {
        return Promise.resolve({ ok: false, error: '引擎互搏中，观战模式不可落子' });
      }
      // 回合制不变量：严格轮替，任何一方不得连走两步（引擎未走时用户不可再走）
      if (positionNow().turn === state.engineSide) {
        return Promise.resolve({ ok: false, error: '轮到引擎行棋' });
      }
      const pos = positionNow();
      const move: XiangqiMove = { kind: 'xiangqi', from: intent.from, to: intent.to };
      if (!game.isLegal(pos, move)) return Promise.resolve({ ok: false, error: '非法着法' });
      tree.play(move);
      finishIfOver();
      pushSnapshot();
      if (!paused && state.phase === 'playing' && engineToMoveNow()) fakeEngineTurn();
      return Promise.resolve({ ok: true });
    },
    undoMove: () => {
      if (state.phase === 'ended') {
        // 终局悔棋复活：保留执方从当前局面继续（对齐 MatchService）
        state.reset();
        state.start({ engineSide: lastEngineSide, strength: null });
      } else {
        const guard = guardPlaying();
        if (guard !== null) return Promise.resolve(guard);
      }
      if (tree.cursor === tree.root) return Promise.resolve({ ok: false, error: '无可悔之着' });
      generation++;
      thinking = false;
      tree.undo();
      if (state.engineSide === 'both') {
        pushSnapshot();
        return Promise.resolve({ ok: true });
      }
      while (tree.cursor !== tree.root && engineToMoveNow()) tree.undo();
      pushSnapshot();
      if (engineToMoveNow()) fakeEngineTurn();
      return Promise.resolve({ ok: true });
    },
    resign: () => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      if (state.engineSide === 'both') {
        return Promise.resolve({ ok: false, error: '观战模式不可认输' });
      }
      generation++;
      thinking = false;
      state.end({ winner: (state.engineSide ?? 'first') as Player, reason: 'resign' });
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
    setEngineSide: (side: EngineSide) => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      generation++;
      thinking = false;
      state.setEngineSide(side);
      pushSnapshot();
      if (!paused && engineToMoveNow()) fakeEngineTurn();
      return Promise.resolve({ ok: true });
    },
    togglePause: () => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      paused = !paused;
      if (paused) {
        generation++;
        thinking = false;
      } else if (engineToMoveNow()) {
        fakeEngineTurn();
      }
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
    pickEnginePath: () => Promise.resolve(null), // 浏览器沙箱无文件对话框，入口由文本框承担
    gotoNode: (nodeId: number) => {
      if (state.phase === 'playing') return Promise.resolve({ ok: false, error: '对局中不可跳转' });
      const walk = (node: typeof tree.root): typeof tree.root | null => {
        if (node.id === nodeId) return node;
        for (const child of node.children) {
          const hit = walk(child);
          if (hit !== null) return hit;
        }
        return null;
      };
      const node = walk(tree.root);
      if (node === null) return Promise.resolve({ ok: false, error: '节点不存在' });
      tree.goTo(node);
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
    getSnapshot: () => Promise.resolve(buildSnapshot()),
    onSnapshot: (cb) => {
      snapshotListeners.add(cb);
      return () => snapshotListeners.delete(cb);
    },
    onEngineStatus: (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    onLiveEval: (cb) => {
      evalListeners.add(cb);
      return () => evalListeners.delete(cb);
    },
  };
}

/** 模拟引擎选着：材料评估 + 吃子/推进的轻量偏好，随机化避免每局同型 */
function pickMove(pos: XiangqiPosition, moves: XiangqiMove[]): XiangqiMove {
  let best: XiangqiMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const target = pieceAt(pos, move.to.x, move.to.y);
    const gain = target === null ? 0 : (PIECE_CP[pieceTypeOf(target)] ?? 0);
    const advance = pos.turn === 'first' ? move.from.y - move.to.y : move.to.y - move.from.y;
    const score = gain * 10 + advance * 2 + Math.random() * 60;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best!;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as AppSettings;
      if (parsed.theme !== undefined) {
        return {
          ...parsed,
          view: { board3d: true, alwaysOnTop: false, ...parsed.view },
          xiangqi: { ponder: false, ...parsed.xiangqi },
        };
      }
    }
  } catch {
    /* 忽略损坏的本地设置 */
  }
  return {
    theme: 'system' satisfies ThemeSetting,
    view: { board3d: true, alwaysOnTop: false },
    xiangqi: { strength: {}, ponder: false },
  };
}

function chromeVersion(): string {
  const match = /Chrome\/(\S+)/.exec(navigator.userAgent);
  return match?.[1] ?? '-';
}
