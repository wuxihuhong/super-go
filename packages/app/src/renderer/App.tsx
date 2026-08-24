import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  findKing,
  pieceAt,
  pieceSide,
  XiangqiGame,
  type Player,
  type Point,
  type XiangqiPosition,
} from '@super-go/core';
import type { EngineStatusPayload, LanguageCode, LiveEval } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import Board from './components/Board';
import SidePanel from './components/SidePanel';
import Toolbar from './components/Toolbar';
import WinBar from './components/WinBar';
import { createT, detectLanguage } from './i18n';

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

  useEffect(() => {
    void window.superGo.getSettings().then((s) => {
      setLang(s.language ?? detectLanguage(navigator.languages));
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

  const game = useMemo(() => new XiangqiGame(), []);
  const position: XiangqiPosition = useMemo(
    () => (snapshot !== null ? game.parse(snapshot.fen) : game.initialPosition()),
    [snapshot, game],
  );

  const userSide: Player = snapshot?.engineSide === 'first' ? 'second' : 'first';
  const interactive =
    snapshot !== null &&
    snapshot.phase === 'playing' &&
    !snapshot.thinking &&
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
      if (piece !== null && pieceSide(piece) === userSide) {
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

  if (lang === null) return null;
  const t = createT(lang);

  const playing = snapshot?.phase === 'playing';
  const canContinue =
    snapshot !== null && snapshot.phase !== 'playing' && snapshot.moves.length > 0;

  return (
    <div className="flex h-full flex-col bg-background">
      <Toolbar
        t={t}
        playing={playing}
        canUndo={playing && (snapshot?.moves.length ?? 0) > 0}
        panelOpen={panelOpen}
        onNewGame={(engineSide, elo) =>
          runIntent(() => window.superGo.newGame({ engineSide, elo, fromCursor: false }))
        }
        onUndo={() => runIntent(() => window.superGo.undoMove())}
        onResign={() => runIntent(() => window.superGo.resign())}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />

      {notice !== null && (
        <div
          className={`flex min-h-8 items-center px-4 py-1 text-xs ${
            notice.bad ? 'text-danger' : 'text-muted-foreground'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 items-center justify-center gap-4 p-6">
          <div className="h-full py-8">
            <WinBar
              redCp={liveEval?.redCp ?? snapshot?.redCp}
              redMate={snapshot?.thinking ? liveEval?.redMate : snapshot?.redMate}
            />
          </div>
          <div
            className="h-full max-w-full"
            style={{ aspectRatio: '0.90', width: 'auto', flex: '0 1 auto' }}
          >
            <Board
              position={position}
              selected={selected}
              targets={legalTargets}
              lastMove={snapshot?.lastMove ?? null}
              checkedKing={checkedKing}
              flip={snapshot?.engineSide === 'first'}
              themeTick={themeTick}
              onSquareClick={handleSquareClick}
            />
          </div>
        </main>

        {panelOpen && (
          <SidePanel
            t={t}
            snapshot={snapshot}
            engineStatus={engineStatus}
            liveEval={liveEval}
            onGoto={(nodeId) => runIntent(() => window.superGo.gotoNode(nodeId))}
          />
        )}
      </div>

      {canContinue && (
        <footer className="flex h-10 shrink-0 items-center justify-end border-t border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => {
              // 续弈沿用"我执红 + 不设限"最保守档，需要改档先走新对局面板
              runIntent(() =>
                window.superGo.newGame({ engineSide: 'second', elo: null, fromCursor: true }),
              );
            }}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {t('setup.continueFrom')}
          </button>
        </footer>
      )}
    </div>
  );
}
