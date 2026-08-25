import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findKing,
  pieceAt,
  pieceSide,
  XiangqiGame,
  type EngineSide,
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
import type { GameSnapshot } from '@shared/game';
import Board from './components/Board';
import Board3D from './components/Board3D';
import SidePanel from './components/SidePanel';
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
  const [resultDismissed, setResultDismissed] = useState(false);
  const [board3d, setBoard3d] = useState(true);
  const [glFailed, setGlFailed] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  // 3D 棋盘在容器内的占比（仅 3D 生效；0.5–1，持久化 view.board3dScale）
  const [board3dScale, setBoard3dScale] = useState(1);
  const board3dScaleTimer = useRef<number | null>(null);
  // 连线（P2）：状态/日志（对局快照走 game:snapshot——连线 = 重开一局）
  const [linkerStatus, setLinkerStatus] = useState<LinkerStatus | null>(null);
  const [linkerLogs, setLinkerLogs] = useState<LinkerLogEntry[]>([]);
  // 中央区实测高度 → 推算棋盘列宽（useElementSize 报告 contentRect，已不含 p-6 内边距）
  const { ref: mainRef, height: mainHeight } = useElementSize<HTMLElement>();
  const boardHeight = Math.max(240, mainHeight * (board3d && !glFailed ? board3dScale : 1));
  // 画布宽高比 =（8+2×0.85）/（9+2×0.85），含坐标编号边距
  const boardColumnWidth = boardHeight * 0.907;

  useEffect(() => {
    void window.superGo.getSettings().then((s) => {
      setLang(s.language ?? detectLanguage(navigator.languages));
      setSoundEnabled(s.sound ?? true);
      setBoard3d(s.view?.board3d ?? true);
      setAlwaysOnTop(s.view?.alwaysOnTop ?? false);
      setBoard3dScale(s.view?.board3dScale ?? 1);
    });
    void window.superGo.getSnapshot().then(setSnapshot);
    // 主题变化时 CSS 变量已自动切换，这里只为触发 canvas 重绘
    return window.superGo.onThemeChanged(() => setThemeTick((tick) => tick + 1));
  }, []);

  useEffect(() => {
    const offSnapshot = window.superGo.onSnapshot((snap) => {
      setSnapshot(snap);
      setSelected(null);
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

  // 新对局开始时重置终局浮层
  useEffect(() => {
    if (snapshot?.phase === 'playing') setResultDismissed(false);
  }, [snapshot?.phase]);

  const game = useMemo(() => new XiangqiGame(), []);
  const position: XiangqiPosition = useMemo(
    () => (snapshot !== null ? game.parse(snapshot.fen) : game.initialPosition()),
    [snapshot, game],
  );

  // ---- 音效（§7.4：走子/吃子/将军/终局）----
  const soundPrev = useRef<{ movesLen: number; pieceCount: number; phase: string }>({
    movesLen: 0,
    pieceCount: 32,
    phase: 'idle',
  });
  useEffect(() => {
    if (snapshot === null) return;
    const pieceCount = position.board.filter((p) => p !== null).length;
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
  }, [snapshot, position]);

  const engineSide = snapshot?.engineSide ?? null;
  const spectating = engineSide === 'both'; // 引擎互搏，人观战
  const userSide: Player | null =
    engineSide === 'first' ? 'second' : engineSide === 'second' ? 'first' : null;
  // 暂停只冻结引擎，用户的回合照常可走（不可跨步：非用户回合 UI 不可落子）
  const interactive =
    snapshot !== null &&
    snapshot.phase === 'playing' &&
    !snapshot.thinking &&
    userSide !== null &&
    snapshot.turn === userSide;

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
      if (piece !== null && userSide !== null && pieceSide(piece) === userSide) {
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
    [interactive, position, selected, legalTargets, userSide],
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
  }, []);

  /** 工具栏快速切换窗口置顶（走设置通道：持久化 + main 即时生效） */
  const handleToggleAlwaysOnTop = useCallback(() => {
    void window.superGo.setSettings({ view: { alwaysOnTop: !alwaysOnTop } });
    setAlwaysOnTop(!alwaysOnTop);
  }, [alwaysOnTop]);

  const handleSetEngineSide = useCallback(
    (side: EngineSide) => {
      runIntent(() => window.superGo.setEngineSide(side));
    },
    [runIntent],
  );

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
        setPanelOpen((v) => !v);
      } else if (e.key === ' ' && !mod) {
        e.preventDefault();
        runIntent(() => window.superGo.togglePause());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runIntent]);

  // 棋盘方位（用户模型 2026-08-25 定稿）——hooks 区实现：
  // 人机开局按执方锚定；连线按平台视角（reversed）持续跟随；
  // 工具栏切执方 → 翻转一次（奇偶）
  const linkerActive =
    linkerStatus !== null &&
    linkerStatus.phase !== 'idle' &&
    linkerStatus.phase !== 'stopped' &&
    linkerStatus.phase !== 'error';
  /** 棋盘朝向：**状态**而非每次渲染现算——现算会在停止连线的瞬间凭空翻一次 */
  const [flip, setFlip] = useState(false);
  const prevPhaseRef = useRef<string>('idle');
  useEffect(() => {
    const phase = snapshot?.phase ?? 'idle';
    const was = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    // 只在"进入对局"这一刻锚定：对局中切换执方不重新锚定，也不翻转（见 boardOrientation）
    if (phase === 'playing' && was !== 'playing' && !linkerActive) {
      const engineSide = snapshot?.engineSide ?? null;
      setFlip((cur) => nextBoardFlip(cur, { type: 'newGame', engineSide }));
    }
  }, [snapshot?.phase, snapshot?.engineSide, linkerActive]);

  // 连线：跟随平台视角（§6.1）。连线也是开局，锚定来自平台；对局中平台自己翻了也跟着翻。
  // 停止连线不在此列——对局保留、局面没动，棋盘就不能动。
  useEffect(() => {
    if (!linkerActive || linkerStatus === null) return;
    setFlip((cur) => nextBoardFlip(cur, { type: 'platformView', reversed: linkerStatus.reversed }));
  }, [linkerActive, linkerStatus]);

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
    const clamped = Math.round(Math.min(2, Math.max(0.5, scale)) * 10) / 10;
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
          (snapshot?.moves.length ?? 0) > 0
        }
        canResign={playing === true && !spectating}
        panelOpen={panelOpen}
        alwaysOnTop={alwaysOnTop}
        engineStatus={engineStatus}
        snapshot={snapshot}
        popover={popover}
        onPopoverChange={setPopover}
        onNewGame={(side) =>
          runIntent(() => window.superGo.newGame({ engineSide: side, fromCursor: false }))
        }
        onUndo={() => runIntent(() => window.superGo.undoMove())}
        onResign={() => runIntent(() => window.superGo.resign())}
        onPauseToggle={() => runIntent(() => window.superGo.togglePause())}
        onSetEngineSide={handleSetEngineSide}
        onToggleEngineSide={handleToggleEngineSide}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        boardZoomDisabled={!board3d || glFailed}
        onBoardZoomIn={() => handleBoard3dScale(board3dScale + 0.1)}
        onBoardZoomOut={() => handleBoard3dScale(board3dScale - 0.1)}
        onTogglePanel={() => setPanelOpen((v) => !v)}
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
        <main ref={mainRef} className="flex min-w-0 flex-1 items-center justify-center p-6">
          {mainHeight > 0 && (
            <div
              className={`relative max-w-full overflow-hidden rounded-xl ${
                board3d && !glFailed ? '' : 'shadow-md' // 3D 自带接地投影，CSS 盒阴影会叠出"外框"
              }`}
              style={{ width: boardColumnWidth, height: boardHeight }}
            >
              {board3d && !glFailed ? (
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
              {/* 终局结果浮层：胜方大字 + 原因 + 快捷操作（渐入，克制动效） */}
              {snapshot?.phase === 'ended' && snapshot.result !== null && !resultDismissed && (
                <div className="fade-in absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
                  <div className="w-64 rounded-xl border border-border bg-surface p-5 text-center shadow-xl">
                    <div
                      className={`text-2xl font-semibold ${
                        snapshot.result.winner === 'first'
                          ? 'text-piece-red'
                          : snapshot.result.winner === 'second'
                            ? 'text-piece-black'
                            : 'text-foreground'
                      }`}
                    >
                      {snapshot.result.winner === 'first'
                        ? t('status.result.redWin')
                        : snapshot.result.winner === 'second'
                          ? t('status.result.blackWin')
                          : t('status.result.draw')}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {snapshot.result.reason === 'mate'
                        ? t('status.reason.mate')
                        : snapshot.result.reason === 'stalemate'
                          ? t('status.reason.stalemate')
                          : snapshot.result.reason === 'resign'
                            ? t('status.reason.resign')
                            : ''}
                    </div>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResultDismissed(true);
                          setPopover('setup'); // 弹新对局面板：由用户选执方再开局
                        }}
                        className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground"
                      >
                        {t('game.rematch')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultDismissed(true)}
                        className="rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                      >
                        {t('game.review')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {panelOpen && (
          <SidePanel
            t={t}
            snapshot={snapshot}
            engineStatus={engineStatus}
            liveEval={liveEval}
            themeTick={themeTick}
            onGoto={(nodeId) => runIntent(() => window.superGo.gotoNode(nodeId))}
            onContinue={() =>
              runIntent(() =>
                window.superGo.newGame({
                  engineSide: spectating ? 'both' : 'second',
                  fromCursor: true,
                }),
              )
            }
          />
        )}
      </div>
    </div>
  );
}
