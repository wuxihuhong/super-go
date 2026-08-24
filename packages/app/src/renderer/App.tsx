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
import type { AppSettings, EngineStatusPayload, LanguageCode, LiveEval } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import Board from './components/Board';
import Board3D from './components/Board3D';
import PlayerBanner from './components/PlayerBanner';
import SidePanel from './components/SidePanel';
import Toolbar, { type Popover } from './components/Toolbar';
import WinBar from './components/WinBar';
import { createT, detectLanguage } from './i18n';
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
  // 中央区实测高度 → 精确推算棋盘列宽（banner/间距为常量，比例不靠 CSS 拼凑）
  const { ref: mainRef, height: mainHeight } = useElementSize<HTMLElement>();
  const BANNER_H = 36;
  const GAP = 8;
  const boardHeight = Math.max(240, mainHeight - BANNER_H * 2 - GAP * 2);
  // 画布宽高比 =（8+2×0.85）/（9+2×0.85），含坐标编号边距
  const boardColumnWidth = boardHeight * 0.907;

  useEffect(() => {
    void window.superGo.getSettings().then((s) => {
      setLang(s.language ?? detectLanguage(navigator.languages));
      setSoundEnabled(s.sound ?? true);
      setBoard3d(s.view?.board3d ?? true);
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
    return () => {
      offSnapshot();
      offStatus();
      offEval();
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
  }, []);

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

  if (lang === null) return null;
  const t = createT(lang);

  const playing = snapshot?.phase === 'playing';
  // 棋盘方位：上方恒为对手（引擎），下方恒为用户；互搏时两侧都是引擎
  const flip = snapshot?.engineSide === 'first';
  const topBannerSide: Player = flip ? 'first' : 'second';
  const bottomBannerSide: Player = flip ? 'second' : 'first';
  const engineName = engineStatus?.name ?? t('panel.engine');
  const engineThinking = playing === true && snapshot?.thinking === true;
  const strengthCaption = snapshot?.strengthLabel ?? t('panel.engine.unlimited');
  const topCaption = engineSide === null ? '' : strengthCaption;
  const checkCaption = playing === true && snapshot?.inCheck === true ? t('status.check') : '';

  return (
    <div className="relative flex h-full flex-col bg-background">
      <Toolbar
        t={t}
        title={t('app.name')}
        playing={playing}
        paused={snapshot?.paused === true}
        canUndo={
          (playing === true || snapshot?.phase === 'ended') && (snapshot?.moves.length ?? 0) > 0
        }
        canResign={playing === true && !spectating}
        panelOpen={panelOpen}
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
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onSettingsChanged={handleSettingsChanged}
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
        <main ref={mainRef} className="flex min-w-0 flex-1 items-center justify-center gap-3 p-6">
          {mainHeight > 0 && (
            <>
              <div className="h-full shrink-0 py-1">
                <WinBar
                  t={t}
                  redCp={liveEval?.redCp ?? snapshot?.redCp}
                  redMate={snapshot?.thinking ? liveEval?.redMate : snapshot?.redMate}
                />
              </div>
              <div
                className="flex h-full max-w-full flex-col"
                style={{ width: boardColumnWidth, gap: GAP }}
              >
                <PlayerBanner
                  t={t}
                  side={topBannerSide}
                  name={engineSide === null ? t('side.black') : engineName}
                  active={playing === true && snapshot?.turn === topBannerSide}
                  thinking={engineThinking && snapshot?.turn === topBannerSide}
                  caption={topCaption}
                />
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl shadow-md">
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
                            onClick={() => runIntent(() => window.superGo.rematch())}
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
                <PlayerBanner
                  t={t}
                  side={bottomBannerSide}
                  name={
                    userSide === null
                      ? engineSide === 'both'
                        ? engineName
                        : t('side.red')
                      : t('player.you')
                  }
                  active={playing === true && snapshot?.turn === bottomBannerSide}
                  thinking={spectating && engineThinking && snapshot?.turn === bottomBannerSide}
                  caption={checkCaption}
                />
              </div>
            </>
          )}
        </main>

        {panelOpen && (
          <SidePanel
            t={t}
            snapshot={snapshot}
            engineStatus={engineStatus}
            liveEval={liveEval}
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
