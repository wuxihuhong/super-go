import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findKing,
  GoGame,
  parseGo,
  pieceAt,
  pieceSide,
  XiangqiGame,
  type EngineSide,
  type GameKind,
  type GameSetup,
  type Player,
  type Point,
  type XiangqiPosition,
} from '@super-go/core';
import type {
  AppSettings,
  EngineStatusPayload,
  LanguageCode,
  LinkerLogEntry,
  LinkerStatus,
  LiveEval,
} from '@shared/ipc';
import { BOARD3D_SCALE, clampBoard3dScale, isLinkerActivePhase } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import Board from './components/Board';
import Board3D from './components/Board3D';
import GoBoard from './components/GoBoard';
import GoBoard3D from './components/GoBoard3D';
import SidePanel from './components/SidePanel';
import StatusBar from './components/StatusBar';
import Toolbar, { type Popover } from './components/Toolbar';
import { createT, detectLanguage } from './i18n';
import { nextBoardFlip } from './lib/boardOrientation';
import { useElementSize } from './lib/useElementSize';
import { playSound, setSoundEnabled } from './lib/sound';

/**
 * 对弈主界面（§7.3 三区布局：顶部工具栏 / 居中棋盘 / 右侧可折叠面板）。
 * 局面重建走 core（@super-go/core 为纯 TS，renderer 直接引），
 * 引擎与对弈权威态在 main，本层只持有快照 + 输入意图。
 */
export default function App() {
  const [lang, setLang] = useState<LanguageCode | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatusPayload | null>(null);
  const [liveEval, setLiveEval] = useState<LiveEval | null>(null);
  const [selected, setSelected] = useState<Point | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [themeTick, setThemeTick] = useState(0);
  const [popover, setPopover] = useState<Popover>('none');
  const [board3d, setBoard3d] = useState(true);
  const [glFailed, setGlFailed] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  // 3D 棋盘在容器内的占比（仅 3D 生效；0.5–2，持久化 view.board3dScale）
  const [board3dScale, setBoard3dScale] = useState(1);
  const [kind, setKind] = useState<GameKind>('xiangqi');
  const userClosedPanel = useRef(false);
  const prevLinkerPhase = useRef<LinkerStatus['phase'] | undefined>(undefined);
  const board3dScaleTimer = useRef<number | null>(null);
  // 连线（P2）：状态/日志（对局快照走 game:snapshot——连线 = 重开一局）
  const [linkerStatus, setLinkerStatus] = useState<LinkerStatus | null>(null);
  const [linkerLogs, setLinkerLogs] = useState<LinkerLogEntry[]>([]);
  // 中央区实测尺寸 → 推算棋盘盒（useElementSize 报告 contentRect，已不含 p-6 内边距）
  const { ref: mainRef, width: mainWidth, height: mainHeight } = useElementSize<HTMLElement>();
  const viewScale = board3d && !glFailed ? board3dScale : 1;
  const mainReady = mainWidth > 0 && mainHeight > 0;
  // 围棋必须真正正方形：宽高一起取 min(avail)，禁止只靠 max-w-full 截宽（会留下竖长条，3D 近沿被裁）
  const goBox = mainReady ? Math.max(240, Math.min(mainWidth, mainHeight) * viewScale) : 0;
  const xiangqiHeight = mainReady ? Math.max(240, mainHeight * viewScale) : 0;
  const boardHeight = kind === 'go' ? goBox : xiangqiHeight;
  const boardColumnWidth = kind === 'go' ? goBox : xiangqiHeight * 0.907;

  useEffect(() => {
    void window.superGo.getSettings().then((s) => {
      setLang(s.language ?? detectLanguage(navigator.languages));
      setSoundEnabled(s.sound ?? true);
      setBoard3d(s.view?.board3d ?? true);
      setAlwaysOnTop(s.view?.alwaysOnTop ?? false);
      setBoard3dScale(s.view?.board3dScale ?? 1);
      setKind(s.activeKind === 'go' ? 'go' : 'xiangqi');
    });
    void window.superGo.getSnapshot().then(setSnapshot);
    // 主题变化时 CSS 变量已自动切换，这里只为触发 canvas 重绘
    return window.superGo.onThemeChanged(() => setThemeTick((tick) => tick + 1));
  }, []);

  useEffect(() => {
    const offSnapshot = window.superGo.onSnapshot((snap) => {
      setSnapshot(snap);
      setSelected(null);
      if (snap.kind === 'go' || snap.kind === 'xiangqi') setKind(snap.kind);
    });
    const offStatus = window.superGo.onEngineStatus(setEngineStatus);
    const offEval = window.superGo.onLiveEval(setLiveEval);
    const offLinkerStatus = window.superGo.onLinkerStatus(setLinkerStatus);
    const offLinkerLog = window.superGo.onLinkerLog((entry) => {
      setLinkerLogs((cur) => [...cur.slice(-60), entry]);
    });
    return () => {
      offSnapshot();
      offStatus();
      offEval();
      offLinkerStatus();
      offLinkerLog();
    };
  }, []);

  useEffect(() => {
    if (lang !== null) document.title = createT(lang)('app.name');
  }, [lang]);

  // 通知 5 秒自动消失
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const game = useMemo(() => new XiangqiGame(), []);
  const goGame = useMemo(() => new GoGame(), []);
  const position: XiangqiPosition = useMemo(
    () =>
      snapshot !== null && snapshot.kind !== 'go' ? game.parse(snapshot.fen) : game.initialPosition(),
    [snapshot, game],
  );
  const goFen = snapshot?.kind === 'go' ? snapshot.fen : null;
  const goPosRef = useRef(goGame.initialPosition());
  const goPosition = useMemo(() => {
    if (goFen !== null) {
      try {
        const next = parseGo(goFen);
        goPosRef.current = next;
        return next;
      } catch {
        // 解析失败保上一手，避免整盘棋子被清空成「落子后丢失」
        return goPosRef.current;
      }
    }
    const empty = goGame.initialPosition();
    goPosRef.current = empty;
    return empty;
  }, [goFen, goGame]);

  // ---- 音效（§7.4：走子/吃子/将军/终局）----
  const soundPrev = useRef<{ movesLen: number; pieceCount: number; phase: string }>({
    movesLen: 0,
    pieceCount: 32,
    phase: 'idle',
  });
  useEffect(() => {
    if (snapshot === null) return;
    const pieceCount =
      snapshot.kind === 'go'
        ? goPosition.cells.filter((c) => c !== null).length
        : position.board.filter((p) => p !== null).length;
    const prev = soundPrev.current;
    const next = { movesLen: snapshot.moves.length, pieceCount, phase: snapshot.phase };
    if (next.movesLen > prev.movesLen) {
      if (next.phase === 'ended') playSound('end');
      else if (snapshot.inCheck) playSound('check');
      else if (next.pieceCount < prev.pieceCount) playSound('capture');
      else playSound('move');
    } else if (next.phase === 'ended' && prev.phase === 'playing') {
      playSound('end');
    }
    soundPrev.current = next;
  }, [snapshot, position, goPosition]);

  const engineSide = snapshot?.engineSide ?? null;
  const spectating = engineSide === 'both'; // 引擎互搏，人观战
  /** 连线进行中（平台是事实源：本地棋盘只跟盘显示，不接受手动改动） */
  const linkerActive = linkerStatus !== null && isLinkerActivePhase(linkerStatus.phase);
  /** 引擎是否托管某一方（toolbar 两开关；双关 = 人执双方） */
  const engineControls = (side: Player): boolean => engineSide === 'both' || engineSide === side;
  // 暂停只冻结引擎，用户的回合照常可走（不可跨步：引擎回合 / 观战时 UI 不可落子）；
  // 连线中一律不可落子——人工接管走平台，本地手动落子会与平台立刻分叉（§6.7，main 侧同样拦截）
  const interactive =
    snapshot !== null &&
    snapshot.phase === 'playing' &&
    !snapshot.thinking &&
    !linkerActive &&
    !engineControls(snapshot.turn);

  const legalTargets = useMemo(() => {
    if (selected === null) return [];
    return game
      .legalMoves(position)
      .filter((m) => m.from.x === selected.x && m.from.y === selected.y)
      .map((m) => m.to);
  }, [selected, position, game]);

  const checkedKing = useMemo(
    () => (snapshot?.inCheck === true ? findKing(position, position.turn) : null),
    [snapshot, position],
  );

  const handleSquareClick = useCallback(
    (x: number, y: number) => {
      if (!interactive) return;
      if (selected !== null && selected.x === x && selected.y === y) {
        setSelected(null);
        return;
      }
      const piece = pieceAt(position, x, y);
      if (piece !== null && pieceSide(piece) === position.turn) {
        setSelected({ x, y });
        return;
      }
      if (selected !== null && legalTargets.some((target) => target.x === x && target.y === y)) {
        void window.superGo.playMove({ from: selected, to: { x, y } }).then((r) => {
          if (!r.ok) setNotice({ text: r.error, bad: true });
        });
        setSelected(null);
      }
    },
    [interactive, position, selected, legalTargets],
  );

  const runIntent = useCallback((action: () => Promise<{ ok: boolean; error?: string }>) => {
    void action().then((r) => {
      if (!r.ok) setNotice({ text: r.error ?? 'error', bad: true });
    });
  }, []);

  /** 外观设置即时生效（§7.5）：语言切换需同步本地 lang；主题走 nativeTheme 事件自动联动 */
  const handleSettingsChanged = useCallback((next: AppSettings) => {
    setLang(next.language ?? detectLanguage(navigator.languages));
    setSoundEnabled(next.sound ?? true);
    setBoard3d(next.view?.board3d ?? true);
    setAlwaysOnTop(next.view?.alwaysOnTop ?? false);
    setBoard3dScale(next.view?.board3dScale ?? 1);
    if (next.activeKind === 'go' || next.activeKind === 'xiangqi') setKind(next.activeKind);
  }, []);

  /** 工具栏快速切换窗口置顶（走设置通道：持久化 + main 即时生效） */
  const handleToggleAlwaysOnTop = useCallback(() => {
    void window.superGo.setSettings({ view: { alwaysOnTop: !alwaysOnTop } });
    setAlwaysOnTop(!alwaysOnTop);
  }, [alwaysOnTop]);

  // ---- 快捷键：⌘/Ctrl+N 新对局 · ⌘Z 悔棋 · ⌘, 设置 · 空格 暂停/继续 · ⌘B 侧栏 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setPopover((cur) => (cur === 'setup' ? 'none' : 'setup'));
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        runIntent(() => window.superGo.undoMove());
      } else if (mod && e.key === ',') {
        e.preventDefault();
        setPopover((cur) => (cur === 'settings' ? 'none' : 'settings'));
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setPanelOpen((v) => {
          const next = !v;
          userClosedPanel.current = !next;
          return next;
        });
      } else if (e.key === ' ' && !mod) {
        e.preventDefault();
        runIntent(() => window.superGo.togglePause());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runIntent]);

  // 棋盘方位（执方与视角解耦，2026-08-26 定稿）——hooks 区实现：
  // 新对局弹窗选的执方只作开局视角锚定（选中颜色朝下），不设置引擎执方；
  // 连线按平台视角（reversed）持续跟随；切换引擎执方/续弈/悔棋一律不翻盘
  // （linkerActive 在上方 interactive 处已算过）
  /** 棋盘朝向：**状态**而非每次渲染现算——现算会在停止连线的瞬间凭空翻一次 */
  const [flip, setFlip] = useState(false);
  /** 待消费的开局视角（新对局弹窗的选择；进入对局那一刻锚定后即清空） */
  const pendingAnchorRef = useRef<Player | null>(null);
  const prevPhaseRef = useRef<string>('idle');
  useEffect(() => {
    const phase = snapshot?.phase ?? 'idle';
    const was = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    // 只在"进入对局"这一刻、且弹窗留有视角选择时锚定：
    // 续弈 / 终局悔棋复活 / 连线重开都不重新锚定（局面没变，棋盘就不能动，见 boardOrientation）
    if (phase === 'playing' && was !== 'playing' && !linkerActive) {
      const anchor = pendingAnchorRef.current;
      if (anchor !== null) {
        pendingAnchorRef.current = null;
        setFlip((cur) => nextBoardFlip(cur, { type: 'newGame', humanSide: anchor }));
      }
    }
  }, [snapshot?.phase, linkerActive]);

  // 连线：跟随平台视角（§6.1）。连线也是开局，锚定来自平台；对局中平台自己翻了也跟着翻。
  // 停止连线不在此列——对局保留、局面没动，棋盘就不能动。
  useEffect(() => {
    if (!linkerActive || linkerStatus === null) return;
    setFlip((cur) => nextBoardFlip(cur, { type: 'platformView', reversed: linkerStatus.reversed }));
  }, [linkerActive, linkerStatus]);

  // 只在首次进入待介入/出错时打开侧栏；定位中不抢焦点，尊重用户关掉
  useEffect(() => {
    const phase = linkerStatus?.phase;
    const prev = prevLinkerPhase.current;
    prevLinkerPhase.current = phase;
    const entered =
      (phase === 'attention' && prev !== 'attention') ||
      (phase === 'error' && prev !== 'error');
    if (entered) {
      userClosedPanel.current = false;
      setPanelOpen(true);
    }
  }, [linkerStatus?.phase]);

  // 新对局后清掉已停止连线的残留横幅（error 留给用户点关闭）
  useEffect(() => {
    if (snapshot?.phase !== 'playing' || linkerStatus === null) return;
    if (linkerStatus.phase === 'stopped' || linkerStatus.phase === 'idle') {
      setLinkerStatus(null);
    }
  }, [snapshot?.phase, linkerStatus]);

  if (lang === null) return null;
  const t = createT(lang);

  const playing = snapshot?.phase === 'playing';
  /** 工具栏执方开关：红/黑各自切换引擎托管（双开=互搏，双关=无引擎） */
  const handleToggleEngineSide = (side: 'first' | 'second'): void => {
    const redOn = engineSide === 'first' || engineSide === 'both';
    const blackOn = engineSide === 'second' || engineSide === 'both';
    const nextRed = side === 'first' ? !redOn : redOn;
    const nextBlack = side === 'second' ? !blackOn : blackOn;
    const next: EngineSide =
      nextRed && nextBlack ? 'both' : nextRed ? 'first' : nextBlack ? 'second' : null;
    // 不翻转棋盘：对局中转 180° 是灾难性体验，且互搏/人执双方这些状态下"翻转"无语义
    runIntent(() => window.superGo.setEngineSide(next));
  };

  /** 3D 棋盘缩放（+/- 步进 10%）：本地即时生效，持久化防抖 400ms */
  const handleBoard3dScale = (scale: number): void => {
    const clamped = clampBoard3dScale(scale);
    setBoard3dScale(clamped);
    if (board3dScaleTimer.current !== null) window.clearTimeout(board3dScaleTimer.current);
    board3dScaleTimer.current = window.setTimeout(() => {
      void window.superGo.setSettings({ view: { board3dScale: clamped } });
    }, 400);
  };

  /** 连线启动：未置顶时提示（不强制，用户自己决定）。普通函数：位于条件
   * return 之后，不可用 useCallback（hooks 顺序违规，React #310） */
  const handleLinkerStart = (intent: Parameters<typeof window.superGo.linkerStart>[0]): void => {
    if (!alwaysOnTop) setNotice({ text: t('linker.notice.alwaysOnTop'), bad: false });
    setPopover('none');
    void window.superGo.linkerStart(intent).then((r) => {
      if (!r.ok) setNotice({ text: r.error, bad: true });
    });
  };

  return (
    <div className="relative flex h-full flex-col bg-background">
      <Toolbar
        t={t}
        title={t('app.name')}
        playing={playing}
        paused={snapshot?.paused === true}
        canUndo={
          (playing === true || snapshot?.phase === 'ended') &&
          (snapshot?.moves.length ?? 0) > 0 &&
          !linkerActive
        }
        canResign={playing === true && !spectating && !linkerActive}
        panelOpen={panelOpen}
        alwaysOnTop={alwaysOnTop}
        engineStatus={engineStatus}
        snapshot={snapshot}
        popover={popover}
        onPopoverChange={setPopover}
        kind={kind}
        onSetKind={(next) => {
          setKind(next);
          void window.superGo.setSettings({ activeKind: next });
          runIntent(() => window.superGo.setKind(next));
        }}
        onPass={() => runIntent(() => window.superGo.playMove({ point: null }))}
        onNewGame={(side, goSetup?: GameSetup) => {
          pendingAnchorRef.current = side;
          runIntent(() => window.superGo.newGame({ fromCursor: false, goSetup }));
        }}
        onUndo={() => runIntent(() => window.superGo.undoMove())}
        onResign={() => runIntent(() => window.superGo.resign())}
        onPauseToggle={() => runIntent(() => window.superGo.togglePause())}
        onToggleEngineSide={handleToggleEngineSide}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        boardZoomDisabled={!board3d || glFailed}
        board3dScale={board3dScale}
        onBoardZoomIn={() => handleBoard3dScale(board3dScale + BOARD3D_SCALE.step)}
        onBoardZoomOut={() => handleBoard3dScale(board3dScale - BOARD3D_SCALE.step)}
        onBoardZoomReset={() => handleBoard3dScale(1)}
        onTogglePanel={() => {
          setPanelOpen((v) => {
            const next = !v;
            userClosedPanel.current = !next;
            return next;
          });
        }}
        onSettingsChanged={handleSettingsChanged}
        linkerStatus={linkerStatus}
        linkerLogs={linkerLogs}
        onLinkerStart={handleLinkerStart}
        onLinkerStop={() => window.superGo.linkerStop()}
        onLinkerPauseToggle={() => window.superGo.linkerPauseToggle()}
        onLinkerResolve={(r) => window.superGo.linkerResolve(r)}
      />

      {/* 通知浮层（不挤压布局） */}
      {notice !== null && (
        <div
          className={`pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-md border border-border bg-surface px-4 py-2 text-xs shadow-md ${
            notice.bad ? 'text-danger' : 'text-muted-foreground'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main
          ref={mainRef}
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-6"
        >
          {mainReady && (
            <div
              className={`relative overflow-hidden rounded-xl ${
                kind === 'go' ? '' : 'max-w-full'
              } ${
                board3d && !glFailed ? '' : 'shadow-md' // 3D 自带接地投影，CSS 盒阴影会叠出"外框"
              }`}
              style={{ width: boardColumnWidth, height: boardHeight }}
            >
              {kind === 'go' ? (
                board3d && !glFailed ? (
                  <GoBoard3D
                    position={goPosition}
                    lastPoint={snapshot?.lastPoint}
                    flip={flip}
                    themeTick={themeTick}
                    interactive={interactive}
                    onPlay={(p) => runIntent(() => window.superGo.playMove({ point: p }))}
                    onUnavailable={() => setGlFailed(true)}
                  />
                ) : (
                  <GoBoard
                    position={goPosition}
                    lastPoint={snapshot?.lastPoint}
                    flip={flip}
                    themeTick={themeTick}
                    interactive={interactive}
                    onPlay={(p) => runIntent(() => window.superGo.playMove({ point: p }))}
                  />
                )
              ) : board3d && !glFailed ? (
                <Board3D
                  position={position}
                  selected={selected}
                  targets={legalTargets}
                  lastMove={snapshot?.lastMove ?? null}
                  checkedKing={checkedKing}
                  flip={flip}
                  themeTick={themeTick}
                  onSquareClick={handleSquareClick}
                  onUnavailable={() => setGlFailed(true)}
                />
              ) : (
                <Board
                  position={position}
                  selected={selected}
                  targets={legalTargets}
                  lastMove={snapshot?.lastMove ?? null}
                  checkedKing={checkedKing}
                  flip={flip}
                  themeTick={themeTick}
                  onSquareClick={handleSquareClick}
                />
              )}
            </div>
          )}
        </main>

        {panelOpen && (
          <SidePanel
            t={t}
            snapshot={snapshot}
            liveEval={liveEval}
            themeTick={themeTick}
            onGoto={(nodeId) => runIntent(() => window.superGo.gotoNode(nodeId))}
            onContinue={() => runIntent(() => window.superGo.newGame({ fromCursor: true }))}
            linkerStatus={linkerStatus}
            onLinkerStop={() => window.superGo.linkerStop()}
            onLinkerPauseToggle={() => window.superGo.linkerPauseToggle()}
            onLinkerResolve={(r) => window.superGo.linkerResolve(r)}
            onLinkerDismiss={() => setLinkerStatus(null)}
          />
        )}
      </div>

      <StatusBar
        t={t}
        snapshot={snapshot}
        engineStatus={engineStatus}
        liveEval={liveEval}
        boardFlipped={flip}
      />
    </div>
  );
}
