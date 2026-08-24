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
import type { AppSettings, EngineStatusPayload, LanguageCode, LiveEval } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import Board from './components/Board';
import PlayerBanner from './components/PlayerBanner';
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

  /** 外观设置即时生效（§7.5）：语言切换需同步本地 lang；主题走 nativeTheme 事件自动联动 */
  const handleSettingsChanged = useCallback((next: AppSettings) => {
    setLang(next.language ?? detectLanguage(navigator.languages));
  }, []);

  if (lang === null) return null;
  const t = createT(lang);

  const playing = snapshot?.phase === 'playing';
  const engineSide = snapshot?.engineSide ?? null;
  // 棋盘方位：上方恒为对手（引擎），下方恒为用户（翻转时引擎执红也在上）
  const engineBannerSide: Player = engineSide ?? 'second';
  const userBannerSide: Player = engineSide === 'first' ? 'second' : 'first';
  const engineName = engineStatus?.name ?? t('panel.engine');
  const engineThinking = playing === true && snapshot?.thinking === true;
  const engineCaption =
    engineSide === null ? '' : (snapshot?.strengthLabel ?? t('panel.engine.unlimited'));
  const userCaption =
    playing === true && snapshot?.inCheck === true && snapshot?.turn === userSide
      ? t('status.check')
      : '';

  return (
    <div className="relative flex h-full flex-col bg-background">
      <Toolbar
        t={t}
        playing={playing}
        canUndo={playing && (snapshot?.moves.length ?? 0) > 0}
        panelOpen={panelOpen}
        engineStatus={engineStatus}
        onNewGame={(side, elo) =>
          runIntent(() => window.superGo.newGame({ engineSide: side, elo, fromCursor: false }))
        }
        onUndo={() => runIntent(() => window.superGo.undoMove())}
        onResign={() => runIntent(() => window.superGo.resign())}
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
        <main className="flex min-w-0 flex-1 items-center justify-center p-6">
          <div className="flex h-full w-fit flex-col gap-2.5">
            <PlayerBanner
              t={t}
              side={engineBannerSide}
              name={engineSide === null ? t('side.black') : engineName}
              active={playing === true && snapshot?.turn === engineBannerSide}
              thinking={engineThinking}
              caption={engineCaption}
            />
            <div className="flex min-h-0 flex-1 gap-4">
              <div className="h-full py-3">
                <WinBar
                  redCp={liveEval?.redCp ?? snapshot?.redCp}
                  redMate={snapshot?.thinking ? liveEval?.redMate : snapshot?.redMate}
                />
              </div>
              <div
                className="h-full max-w-full overflow-hidden rounded-xl shadow-md"
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
            </div>
            <PlayerBanner
              t={t}
              side={userBannerSide}
              name={t('player.you')}
              active={playing === true && snapshot?.turn === userBannerSide}
              thinking={false}
              caption={userCaption}
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
            onContinue={() =>
              runIntent(() =>
                window.superGo.newGame({ engineSide: 'second', elo: null, fromCursor: true }),
              )
            }
          />
        )}
      </div>
    </div>
  );
}
