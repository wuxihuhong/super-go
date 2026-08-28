import { useEffect, useRef, useState } from 'react';
import type { LinkerResolution, LinkerStatus, LiveEval } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import EvalChart from './EvalChart';
import LinkerLiveStatus, { linkerLiveVisible } from './LinkerLiveStatus';
import type { MessageKey, TFunction } from '../i18n';
import { delayingBannerText } from '../lib/engineStatusText';

const PANEL_MIN = 224;
const PANEL_MAX = 480;
const PANEL_DEFAULT = 288;

export interface SidePanelProps {
  t: TFunction;
  snapshot: GameSnapshot | null;
  /** 主题切换 tick（驱动折线图重绘） */
  themeTick: number;
  onGoto: (nodeId: number) => void;
  onContinue: () => void;
  liveEval: LiveEval | null;
  linkerStatus: LinkerStatus | null;
  onLinkerStop: () => void;
  onLinkerPauseToggle: () => void;
  onLinkerResolve: (resolution: LinkerResolution) => void;
  onLinkerDismiss: () => void;
}

/** 右侧可折叠面板：对局状态 + 着法列表 + 评估走势；左缘可拖拽调宽（持久化） */
export default function SidePanel(props: SidePanelProps) {
  const { snapshot } = props;
  const browsing = snapshot !== null && snapshot.phase !== 'playing';
  const status = statusOf(props);
  const canContinue = snapshot !== null && browsing && snapshot.moves.length > 0;

  const [width, setWidth] = useState((): number => {
    const saved = Number(window.localStorage.getItem('sidepanel-width'));
    return Number.isFinite(saved) && saved >= PANEL_MIN && saved <= PANEL_MAX
      ? saved
      : PANEL_DEFAULT;
  });
  const drag = useRef<{ startX: number; startW: number; width: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = { startX: e.clientX, startW: width, width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (d === null) return;
    const next = Math.max(PANEL_MIN, Math.min(PANEL_MAX, d.startW - (e.clientX - d.startX)));
    d.width = next;
    setWidth(next);
  };
  // 指针可能被系统取消（Cmd-Tab/失焦/触控中断）：统一走此处收尾并持久化
  const onHandleUp = (): void => {
    const d = drag.current;
    if (d === null) return;
    drag.current = null;
    window.localStorage.setItem('sidepanel-width', String(d.width));
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-border bg-surface"
      style={{ width }}
    >
      {/* 拖拽把手（左缘） */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onLostPointerCapture={onHandleUp}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/40"
      />
      {/* 状态行 */}
      <div className="flex min-h-11 items-center gap-2 border-b border-border px-4">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            status.tone === 'danger'
              ? 'bg-danger'
              : status.tone === 'busy'
                ? 'animate-pulse bg-accent'
                : 'bg-muted-foreground/50'
          }`}
        />
        <span className="text-xs text-foreground">{status.text}</span>
        {status.check !== undefined && (
          <span className="ml-auto rounded border border-danger px-1.5 py-0.5 text-[10px] text-danger">
            {status.check}
          </span>
        )}
      </div>

      {canContinue && (
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={props.onContinue}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            {props.t('setup.continueFrom')}
          </button>
        </div>
      )}

      {/* 着法列表 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.t('panel.moves')}
        </h2>
        <MoveList t={props.t} snapshot={snapshot} browsing={browsing} onGoto={props.onGoto} />
        {linkerLiveVisible(props.linkerStatus) && props.linkerStatus !== null && (
          <div className="border-t border-border px-3 py-2">
            <LinkerLiveStatus
              t={props.t}
              status={props.linkerStatus}
              onStop={props.onLinkerStop}
              onPauseToggle={props.onLinkerPauseToggle}
              onResolve={props.onLinkerResolve}
              onDismiss={props.onLinkerDismiss}
            />
          </div>
        )}
      </div>

      {/* 评估走势 */}
      <div className="border-t border-border px-4 py-2">
        <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.t('panel.chart')}
        </h2>
        <EvalChart
          moves={snapshot?.moves ?? []}
          liveEval={props.liveEval}
          themeTick={props.themeTick}
          emptyText={props.t('panel.chart.empty')}
          mode={snapshot?.kind === 'go' ? 'winRate' : 'cp'}
        />
      </div>
    </aside>
  );
}

function MoveList({
  t,
  snapshot,
  browsing,
  onGoto,
}: {
  t: TFunction;
  snapshot: GameSnapshot | null;
  browsing: boolean;
  onGoto: (nodeId: number) => void;
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const moves = snapshot?.moves ?? [];
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [moves.length]);

  const rows: Array<{ num: number; red?: (typeof moves)[number]; black?: (typeof moves)[number] }> =
    [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ num: i / 2 + 1, red: moves[i], black: moves[i + 1] });
  }

  const moveSpan = (
    item: (typeof moves)[number] | undefined,
    ply: 0 | 1,
  ): React.JSX.Element | null => {
    if (item === undefined) return <span />;
    const active = snapshot?.cursorNodeId === item.nodeId;
    // 着法按行棋方着色（红左黑右的列约定之外再加色彩语义，一眼可辨归属）
    const sideColor = ply === 0 ? 'text-piece-red' : 'text-piece-black';
    return (
      <button
        type="button"
        disabled={!browsing}
        onClick={() => onGoto(item.nodeId)}
        title={item.iccs}
        className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left tabular-nums transition-colors ${
          active ? 'bg-accent/15' : 'hover:bg-background'
        } ${sideColor} ${browsing ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {item.notation}
      </button>
    );
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {rows.length === 0 ? (
        <p className="px-2 pt-2 text-xs text-muted-foreground">{t('panel.empty')}</p>
      ) : (
        <>
          {/* 列头：左列红方、右列黑方 */}
          <div className="flex items-center gap-1 px-1 pb-1 text-[10px] text-muted-foreground select-none">
            <span className="w-6 shrink-0" />
            <span className="min-w-0 flex-1 px-1.5 text-piece-red">
              {t(snapshot?.kind === 'go' ? 'side.blackGo' : 'side.red')}
            </span>
            <span className="min-w-0 flex-1 px-1.5 text-piece-black">
              {t(snapshot?.kind === 'go' ? 'side.whiteGo' : 'side.black')}
            </span>
          </div>
          <ol className="space-y-0.5">
            {rows.map((row) => (
              <li key={row.num} className="flex items-center gap-1 text-xs">
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                  {row.num}.
                </span>
                {moveSpan(row.red, 0)}
                {moveSpan(row.black, 1)}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function statusOf(props: SidePanelProps): {
  text: string;
  tone: 'neutral' | 'busy' | 'danger';
  check?: string;
} {
  const { t, snapshot } = props;
  if (snapshot === null) return { text: t('status.idle'), tone: 'neutral' };
  if (snapshot.phase === 'ended' && snapshot.result !== null) {
    const go = snapshot.kind === 'go';
    const winner =
      snapshot.result.winner === 'first'
        ? t(go ? 'status.result.blackWinGo' : 'status.result.redWin')
        : snapshot.result.winner === 'second'
          ? t(go ? 'status.result.whiteWinGo' : 'status.result.blackWin')
          : t('status.result.draw');
    const reasonKey: MessageKey | null =
      snapshot.result.reason === 'mate'
        ? 'status.reason.mate'
        : snapshot.result.reason === 'stalemate'
          ? 'status.reason.stalemate'
          : snapshot.result.reason === 'resign'
            ? 'status.reason.resign'
            : snapshot.result.reason === 'twoPasses'
              ? 'status.reason.twoPasses'
              : null;
    const reason = reasonKey !== null ? ` · ${t(reasonKey)}` : '';
    return { text: `${winner}${reason}`, tone: 'neutral' };
  }
  if (snapshot.phase !== 'playing') {
    return { text: t('status.reviewing'), tone: 'neutral' };
  }
  if (snapshot.playDelaySec !== undefined) {
    return { text: delayingBannerText(t, snapshot.playDelaySec), tone: 'busy' };
  }
  if (snapshot.thinking) {
    return { text: t('status.thinking'), tone: 'busy' };
  }
  return {
    text: t(
      snapshot.kind === 'go'
        ? snapshot.turn === 'first'
          ? 'status.turn.blackGo'
          : 'status.turn.whiteGo'
        : snapshot.turn === 'first'
          ? 'status.turn.red'
          : 'status.turn.black',
    ),
    tone: 'neutral',
    check: snapshot.inCheck ? t('status.check') : undefined,
  };
}

