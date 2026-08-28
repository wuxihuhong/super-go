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
  defaultKomi,
  GameStateMachine,
  GoGame,
  goMoveToGtp,
  isInCheck,
  MoveTree,
  moveToIccs,
  normalizeGoStrength,
  normalizeXiangqiStrength,
  pieceAt,
  pieceTypeOf,
  pieceSide,
  XiangqiGame,
  type EngineSide,
  type GameKind,
  type GameResult,
  type GoMove,
  type GoPosition,
  type Player,
  type XiangqiMove,
  type XiangqiPosition,
} from '@super-go/core';
import {
  GO_ANALYSIS_DEFAULT,
  type AppSettings,
  type EngineStatusPayload,
  type LinkerLogEntry,
  type LinkerStatus,
  type SuperGoApi,
  type ThemeSetting,
} from '@shared/ipc';
import { LINKER_SETTINGS_DEFAULT, type ActiveWindowPick } from '@shared/linker';
import { MOVE_DELAY_DEFAULT, pickMoveDelayMs } from '@shared/moveDelay';
import type {
  GameSnapshot,
  IntentResult,
  LiveEval,
  MainlineItem,
  NewGameIntent,
  PlayMoveIntent,
} from '@shared/game';
import { toRedPerspective } from '@shared/score';

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

const MOCK_WINDOWS = [
  { id: 101, title: 'Mock 棋盘平台 A', region: { left: 0, top: 40, width: 900, height: 950 } },
  { id: 102, title: 'Mock 网页浏览器', region: { left: 100, top: 100, width: 1280, height: 800 } },
  { id: 103, title: '天天象棋', region: { left: 80, top: 60, width: 1100, height: 860 } },
  { id: 104, title: 'JJ象棋', region: { left: 200, top: 80, width: 1024, height: 768 } },
];

export function installMockApi(): void {
  (window as { superGo?: SuperGoApi }).superGo = createMockApi();
  console.info('[mock] 浏览器开发模式：window.superGo 为模拟实现（无真实引擎）');
}

function createMockApi(): SuperGoApi {
  const game = new XiangqiGame();
  let tree = new MoveTree<XiangqiMove, XiangqiPosition>(game);
  const state = new GameStateMachine('xiangqi');
  const goGame = new GoGame();
  let goTree = new MoveTree<GoMove, GoPosition>(goGame, { boardSize: 19 });
  const goState = new GameStateMachine('go');
  let kind: GameKind = 'xiangqi';
  let thinking = false;
  let playDelaySec: number | undefined;
  let paused = false;
  /** 终局悔棋复活用：end 清空 state 前留底执方 */
  let lastEngineSide: EngineSide = null;
  let generation = 0;

  const snapshotListeners = new Set<(snap: GameSnapshot) => void>();
  const statusListeners = new Set<(payload: EngineStatusPayload) => void>();
  const evalListeners = new Set<(evaluation: LiveEval | null) => void>();
  const pushLiveEval = (evaluation: LiveEval | null): void => {
    for (const cb of evalListeners) cb(evaluation);
  };
  const themeListeners = new Set<(dark: boolean) => void>();

  // ---- 连线 mock 状态 ----
  let linkerTimer: number | null = null;
  let linkerPhase: LinkerStatus['phase'] = 'idle';
  let linkerWindowTitle = 'Mock 棋盘平台 A';
  const linkerStatusListeners = new Set<(status: LinkerStatus) => void>();
  const linkerLogListeners = new Set<(entry: LinkerLogEntry) => void>();
  const pushLinkerStatus = (): void => {
    linkerStatusListeners.forEach((cb) =>
      cb({
        phase: linkerPhase,
        windowTitle: linkerWindowTitle,
        fps: 8 + Math.floor(Math.random() * 4),
        inferMs: 60 + Math.floor(Math.random() * 40),
        reversed: false,
        moves: 0,
        message: null,
        reason: null,
        locateHint: null,
      }),
    );
  };
  const pushLinkerLog = (level: LinkerLogEntry['level'], text: string): void => {
    linkerLogListeners.forEach((cb) => cb({ time: Date.now(), level, text }));
  };

  // ---- 设置（localStorage 持久化；主题用 class 覆盖，无 nativeTheme）----
  let settings: AppSettings = loadSettings();
  kind = settings.activeKind === 'go' ? 'go' : 'xiangqi';
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

  const liveState = (): GameStateMachine => (kind === 'go' ? goState : state);

  const buildGoSnapshot = (): GameSnapshot => {
    const path = goTree.pathOf(goTree.cursor);
    const items: MainlineItem[] = [];
    let notationPos = goTree.positionOf(path[0]!);
    for (let i = 1; i < path.length; i++) {
      const node = path[i]!;
      const wr = node.evalRecord?.score.kind === 'winRate' ? node.evalRecord.score : undefined;
      items.push({
        nodeId: node.id,
        iccs: goMoveToGtp(node.move!, notationPos.size),
        notation: goGame.moveToNotation(notationPos, node.move!),
        winRate: wr?.winRate,
        lead: wr?.lead,
        depth: node.evalRecord?.depth,
      });
      notationPos = goTree.positionOf(node);
    }
    const pos = goTree.positionOf(goTree.cursor);
    const snap = goState.snapshot;
    return {
      kind: 'go',
      phase: snap.phase,
      engineSide: snap.engineSide,
      strengthLabel: snap.strength === null ? null : snap.strength.label,
      result: snap.result,
      turn: pos.turn,
      fen: goGame.serialize(pos),
      moves: items,
      cursorNodeId: goTree.cursor.id,
      paused,
      thinking,
      playDelaySec,
      inCheck: false,
      lastMove: null,
      lastPoint: goTree.cursor.move === null ? undefined : goTree.cursor.move.point,
      winRate: items.at(-1)?.winRate,
      lead: items.at(-1)?.lead,
      depth: items.at(-1)?.depth,
      boardSize: pos.size,
      komi: pos.komi,
    };
  };

  const buildSnapshot = (): GameSnapshot => {
    if (kind === 'go') return buildGoSnapshot();
    const path = tree.pathOf(tree.cursor);
    const items: MainlineItem[] = [];
    let notationPos = tree.positionOf(path[0]!);
    for (let i = 1; i < path.length; i++) {
      const node = path[i]!;
      const record = node.evalRecord;
      const cp = record !== undefined && record.score.kind === 'cp' ? record.score : undefined;
      const { redCp: itemCp, redMate: itemMate } = toRedPerspective(
        notationPos.turn,
        cp?.value,
        cp?.mate,
      );
      items.push({
        nodeId: node.id,
        iccs: moveToIccs(node.move!),
        notation: game.moveToNotation(notationPos, node.move!),
        redCp: itemCp,
        redMate: itemMate,
        depth: record?.depth,
      });
      notationPos = tree.positionOf(node);
    }
    const pos = positionNow();
    const snap = state.snapshot;
    let redCp: number | undefined;
    let depth: number | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (redCp === undefined && item.redCp !== undefined) redCp = item.redCp;
      if (depth === undefined && item.depth !== undefined) depth = item.depth;
      if (redCp !== undefined && depth !== undefined) break;
    }
    return {
      kind: 'xiangqi',
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
      playDelaySec,
      inCheck: isInCheck(pos, pos.turn),
      lastMove:
        tree.cursor.move === null ? null : { from: tree.cursor.move.from, to: tree.cursor.move.to },
      redCp,
      depth,
    };
  };

  const pushSnapshot = (): void => {
    const snap = buildSnapshot();
    for (const cb of snapshotListeners) cb(snap);
  };

  const pushStatus = (status: EngineStatusPayload['status'], delaySec?: number): void => {
    for (const cb of statusListeners) cb({ status, name: 'Mock Engine 1800', delaySec });
  };

  const clearThinking = (): void => {
    thinking = false;
    playDelaySec = undefined;
    pushLiveEval(null);
    pushStatus('ready');
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

  const fakeGoEngineTurn = (): void => {
    const gen = ++generation;
    thinking = true;
    pushStatus('thinking');
    pushSnapshot();
    const pos = goTree.positionOf(goTree.cursor);
    const moves = goGame.legalMoves(pos).filter((m) => m.point !== null);
    setTimeout(() => {
      if (gen !== generation) return;
      const choice = moves[Math.floor(Math.random() * Math.max(1, moves.length))] ?? { kind: 'go' as const, point: null };
      const node = goTree.play(choice);
      const wr = 0.45 + Math.random() * 0.1;
      node.evalRecord = {
        score: { kind: 'winRate', winRate: pos.turn === 'first' ? wr : 1 - wr, lead: (wr - 0.5) * 8 },
        depth: 80,
        source: 'Mock KataGo',
      };
      thinking = false;
      const over = goGame.isGameOver(goTree.positionOf(goTree.cursor), []);
      if (over && goState.phase === 'playing') goState.end(over);
      pushStatus('ready');
      pushSnapshot();
      if (!paused && goState.phase === 'playing' && (goState.engineSide === 'both' || goState.engineSide === goTree.positionOf(goTree.cursor).turn)) {
        fakeGoEngineTurn();
      }
    }, 400);
  };

  const fakeEngineTurn = (): void => {
    if (kind === 'go') {
      fakeGoEngineTurn();
      return;
    }
    const gen = ++generation;
    thinking = true;
    playDelaySec = undefined;
    pushLiveEval(null);
    pushStatus('thinking');
    pushSnapshot();
    const pos = positionNow();
    const moves = game.legalMoves(pos);
    if (moves.length === 0) {
      thinking = false;
      pushLiveEval(null);
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
          pushLiveEval({ redCp: materialRedCp(pos) + (i % 2 === 0 ? 12 : -8), depth: 8 + i * 3 });
        },
        (600 / frames) * i,
      );
    }
    setTimeout(() => {
      if (gen !== generation) return;
      const delayMs = pickMoveDelayMs(settings.xiangqi);
      const play = (): void => {
        if (gen !== generation) return;
        playDelaySec = undefined;
        const choice = pickMove(pos, moves);
        const node = tree.play(choice);
        const flip = pos.turn === 'first' ? 1 : -1;
        node.evalRecord = {
          score: { kind: 'cp', value: materialRedCp(positionNow()) * flip },
          depth: 8 + frames * 3,
          source: 'Mock Engine',
        };
        thinking = false;
        pushLiveEval(null);
        finishIfOver();
        pushStatus('ready');
        pushSnapshot();
        if (!paused && state.phase === 'playing' && engineToMoveNow()) fakeEngineTurn();
      };
      if (delayMs > 0) {
        playDelaySec = delayMs / 1000;
        pushStatus('delaying', playDelaySec);
        pushSnapshot();
        setTimeout(play, delayMs);
      } else {
        play();
      }
    }, 600);
  };

  const finishIfOver = (): void => {
    if (state.phase !== 'playing') return;
    const pos = positionNow();
    const result: GameResult | null = game.isGameOver(pos, [pos]);
    if (result !== null) state.end(result);
  };

  /** 当前是否轮到引擎（含互搏） */
  const engineToMoveNow = (): boolean => {
    if (kind === 'go') {
      const side = goState.engineSide;
      return side === 'both' || side === goTree.positionOf(goTree.cursor).turn;
    }
    const side = state.engineSide;
    return side === 'both' || side === positionNow().turn;
  };

  const guardPlaying = (): IntentResult | null => {
    if (liveState().phase !== 'playing') return { ok: false, error: '对局未在进行中' };
    return null;
  };

  const api: SuperGoApi = {
    getAppInfo: () =>
      Promise.resolve({
        versions: { app: '0.0.1-mock', electron: '-', node: '-', chrome: chromeVersion() },
        platform: navigator.platform,
        cpuThreads: Math.max(1, navigator.hardwareConcurrency || 1),
      }),
    getSettings: () => Promise.resolve({ ...settings }),
    setSettings: (patch) => {
      const xiangqi = patch.xiangqi
        ? {
            ...patch.xiangqi,
            ...(patch.xiangqi.strength !== undefined
              ? {
                  strength: normalizeXiangqiStrength(
                    patch.xiangqi.strength,
                    navigator.hardwareConcurrency,
                  ),
                }
              : {}),
          }
        : undefined;
      if (patch.activeKind === 'go' || patch.activeKind === 'xiangqi') {
        kind = patch.activeKind;
      }
      const go = {
        ...settings.go,
        ...patch.go,
        analysis: { ...settings.go?.analysis, ...patch.go?.analysis },
      };
      if (patch.go?.rules !== undefined && patch.go.komi === undefined) {
        go.komi = defaultKomi(go.rules ?? 'chinese');
      }
      settings = {
        ...settings,
        ...patch,
        view: { board3d: true, alwaysOnTop: false, ...settings.view, ...patch.view },
        xiangqi: { ponder: false, ...settings.xiangqi, ...xiangqi },
        go,
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
      clearThinking();
      paused = false;
      if (kind === 'go') {
        if (goState.phase === 'playing') goState.abort();
        if (!intent.fromCursor) {
          goTree = new MoveTree<GoMove, GoPosition>(
            goGame,
            intent.goSetup ?? {
              boardSize: 19,
              komi: settings.go?.komi,
              rules: settings.go?.rules,
            },
          );
        }
        const profile = { label: `${normalizeGoStrength(settings.go?.strength).visits} visits`, params: { maxVisits: normalizeGoStrength(settings.go?.strength).visits } };
        const engineSide = intent.engineSide ?? (intent.fromCursor === true ? lastEngineSide : null);
        goState.start({ engineSide, strength: profile });
        lastEngineSide = engineSide;
        pushStatus('ready');
        pushSnapshot();
        if (engineToMoveNow()) fakeEngineTurn();
        return Promise.resolve({ ok: true });
      }
      if (state.phase === 'playing') state.abort();
      if (!intent.fromCursor) tree = new MoveTree<XiangqiMove, XiangqiPosition>(game);
      const profile = chessStrengthFromConfig(normalizeXiangqiStrength(settings.xiangqi?.strength));
      // 对齐 MatchService：新开一局 = 引擎不上场（开局选项只定视角）；续弈/复活保留当前执方
      const engineSide =
        intent.engineSide ?? (intent.fromCursor === true ? lastEngineSide : null);
      state.start({ engineSide, strength: profile });
      lastEngineSide = engineSide;
      pushStatus('ready');
      pushSnapshot();
      if (engineToMoveNow()) fakeEngineTurn();
      return Promise.resolve({ ok: true });
    },
    playMove: (intent: PlayMoveIntent) => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      if (thinking) return Promise.resolve({ ok: false, error: '引擎思考中' });
      if (kind === 'go') {
        if (goState.engineSide === 'both') {
          return Promise.resolve({ ok: false, error: '引擎互搏中，观战模式不可落子' });
        }
        if (goTree.positionOf(goTree.cursor).turn === goState.engineSide) {
          return Promise.resolve({ ok: false, error: '轮到引擎行棋' });
        }
        const pos = goTree.positionOf(goTree.cursor);
        const move: GoMove = { kind: 'go', point: intent.point ?? null };
        if (!goGame.isLegal(pos, move)) return Promise.resolve({ ok: false, error: '非法着法' });
        goTree.play(move);
        const over = goGame.isGameOver(goTree.positionOf(goTree.cursor), []);
        if (over && goState.phase === 'playing') goState.end(over);
        pushSnapshot();
        if (!paused && goState.phase === 'playing' && engineToMoveNow()) fakeEngineTurn();
        return Promise.resolve({ ok: true });
      }
      if (state.engineSide === 'both') {
        return Promise.resolve({ ok: false, error: '引擎互搏中，观战模式不可落子' });
      }
      // 回合制不变量：严格轮替，任何一方不得连走两步（引擎未走时用户不可再走）
      if (positionNow().turn === state.engineSide) {
        return Promise.resolve({ ok: false, error: '轮到引擎行棋' });
      }
      const pos = positionNow();
      if (intent.from === undefined || intent.to === undefined) {
        return Promise.resolve({ ok: false, error: '非法着法' });
      }
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
      clearThinking();
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
      if (liveState().engineSide === 'both') {
        return Promise.resolve({ ok: false, error: '观战模式不可认输' });
      }
      generation++;
      clearThinking();
      liveState().end({ winner: (liveState().engineSide ?? 'first') as Player, reason: 'resign' });
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
    setEngineSide: (side: EngineSide) => {
      const guard = guardPlaying();
      if (guard !== null) return Promise.resolve(guard);
      generation++;
      clearThinking();
      liveState().setEngineSide(side);
      lastEngineSide = side;
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
        clearThinking();
      } else if (engineToMoveNow()) {
        fakeEngineTurn();
      }
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
    pickEnginePath: () => Promise.resolve(null), // 浏览器沙箱无文件对话框，入口由文本框承担
    pickGoEnginePath: () => Promise.resolve(null),
    pickGoModelPath: () => Promise.resolve(null),
    pickGoConfigPath: () => Promise.resolve(null),
    setKind: (next) => {
      generation++;
      clearThinking();
      kind = next;
      settings = { ...settings, activeKind: next };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if (next === 'go') goState.reset();
      else state.reset();
      pushSnapshot();
      return Promise.resolve({ ok: true });
    },
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

    // ---- 连线 mock（浏览器模式 UI 调试：假窗口 + 状态/日志推送；对局走 mock 对弈通路）----
    linkerListWindows: () => Promise.resolve(MOCK_WINDOWS),
    linkerActiveWindow: (): Promise<ActiveWindowPick> => {
      const q = new URLSearchParams(window.location.search).get('pick');
      if (
        q === 'self' ||
        q === 'tooSmall' ||
        q === 'emptyTitle' ||
        q === 'noHandle' ||
        q === 'error'
      ) {
        return Promise.resolve({ ok: false, reason: q });
      }
      const win = MOCK_WINDOWS[2] ?? MOCK_WINDOWS[0]!;
      return Promise.resolve({ ok: true, window: win });
    },
    linkerStart: async (intent) => {
      if (linkerTimer !== null) return Promise.resolve({ ok: false, error: 'mock linker running' });
      const win = MOCK_WINDOWS.find((w) => w.id === intent.windowId);
      if (win === undefined) return Promise.resolve({ ok: false, error: '目标窗口不存在' });
      linkerWindowTitle = win.title;
      linkerPhase = 'scanning';
      pushLinkerStatus();
      pushLinkerLog('info', 'mock linker started (browser dev mode)');
      // 连线 = 重开一局：走 mock 对弈通路（initialFen 用平台识别局面的模拟）
      const r = await api.newGame({
        engineSide: null, // 连线后引擎不控制，执方由工具栏按钮设置
        initialFen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
      });
      if (!r.ok) return Promise.resolve(r);
      let tick = 0;
      linkerTimer = window.setInterval(() => {
        tick++;
        linkerPhase = tick % 4 === 0 ? 'thinking' : 'scanning';
        pushLinkerStatus();
        if (tick % 8 === 0) pushLinkerLog('info', 'mock recognition frame processed');
      }, 1200);
      return Promise.resolve({ ok: true });
    },
    linkerStop: () => {
      if (linkerTimer !== null) {
        window.clearInterval(linkerTimer);
        linkerTimer = null;
      }
      linkerPhase = 'idle';
      pushLinkerStatus();
      pushLinkerLog('info', 'mock linker stopped');
    },
    linkerResolve: () => {
      linkerPhase = 'scanning';
      pushLinkerStatus();
    },
    linkerPauseToggle: () => {
      pushLinkerLog('info', 'mock pause toggled');
    },
    linkerPermissions: () => Promise.resolve([]),
    linkerAskPermission: () => {},
    onLinkerStatus: (cb) => {
      linkerStatusListeners.add(cb);
      return () => linkerStatusListeners.delete(cb);
    },
    onLinkerLog: (cb) => {
      linkerLogListeners.add(cb);
      return () => linkerLogListeners.delete(cb);
    },
  };
  return api;
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
          xiangqi: {
            ponder: false,
            moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
            moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
            ...parsed.xiangqi,
          },
          go: {
            ponder: false,
            moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
            moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
            rules: 'chinese',
            komi: 7.5,
            boardSize: 19,
            ...parsed.go,
            strength: { ...parsed.go?.strength },
            analysis: { ...GO_ANALYSIS_DEFAULT, ...parsed.go?.analysis },
          },
        };
      }
    }
  } catch {
    /* 忽略损坏的本地设置 */
  }
  return {
    theme: 'system' satisfies ThemeSetting,
    view: { board3d: true, alwaysOnTop: false },
    activeKind: 'xiangqi',
    xiangqi: {
      strength: {},
      ponder: false,
      moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
      moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
    },
    go: {
      strength: {},
      ponder: false,
      moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
      moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
      rules: 'chinese',
      komi: 7.5,
      boardSize: 19,
      analysis: { ...GO_ANALYSIS_DEFAULT },
    },
    linker: { ...LINKER_SETTINGS_DEFAULT },
  };
}

function chromeVersion(): string {
  const match = /Chrome\/(\S+)/.exec(navigator.userAgent);
  return match?.[1] ?? '-';
}
