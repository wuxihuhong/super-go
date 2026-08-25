import { useEffect, useRef, useState } from 'react';
import type { GameSnapshot } from '@shared/game';
import type { EngineStatusPayload, LiveEval } from '@shared/ipc';
import EvalChart from './EvalChart';
import { evalValueText } from '../lib/eval';
import type { MessageKey, TFunction } from '../i18n';

const PANEL_MIN = 224;
const PANEL_MAX = 480;
const PANEL_DEFAULT = 288;

export interface SidePanelProps {
  t: TFunction;
  snapshot: GameSnapshot | null;
  engineStatus: EngineStatusPayload | null;
  liveEval: LiveEval | null;
  /** 主题切换 tick（驱动折线图重绘） */
  themeTick: number;
  onGoto: (nodeId: number) => void;
  onContinue: () => void;
}

/** 右侧可折叠面板：状态 + 着法列表 + 评估走势 + 引擎信息；左缘可拖拽调宽（持久化） */
export default function SidePanel(props: SidePanelProps) {
  const { snapshot, engineStatus } = props;
  const browsing = snapshot !== null && snapshot.phase !== 'playing';
  const status = statusOf(props);
  const evalText = evalTextOf(props);
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
      </div>

      {/* 评估走势（着法之后、引擎信息之前） */}
      <div className="border-t border-border px-4 py-2">
        <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.t('panel.chart')}
        </h2>
        <EvalChart
          moves={snapshot?.moves ?? []}
          themeTick={props.themeTick}
          emptyText={props.t('panel.chart.empty')}
          legendRed={props.t('side.red')}
          legendBlack={props.t('side.black')}
        />
      </div>

      {/* 引擎信息 */}
      <div className="border-t border-border px-4 py-3">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.t('panel.engine')}
        </h2>
        <dl className="space-y-1 text-xs">
          <Row label={props.t('panel.engine')} value={engineStatus?.name ?? '—'} />
          <Row
            label={props.t('toolbar.newGame')}
            value={engineStatusLabel(props.t, engineStatus?.status)}
          />
          <Row
            label={props.t('panel.engine.strength')}
            value={snapshot?.strengthLabel ?? props.t('panel.engine.unlimited')}
          />
          <Row
            label={props.t('panel.engine.depth')}
            value={
              snapshot?.thinking === true && props.liveEval?.depth !== undefined
                ? String(props.liveEval.depth)
                : '—'
            }
          />
          <Row label={props.t('panel.engine.eval')} value={evalText} />
        </dl>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate tabular-nums">{value}</dd>
    </div>
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
            <span className="min-w-0 flex-1 px-1.5 text-piece-red">{t('side.red')}</span>
            <span className="min-w-0 flex-1 px-1.5 text-piece-black">{t('side.black')}</span>
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
    const winner =
      snapshot.result.winner === 'first'
        ? t('status.result.redWin')
        : snapshot.result.winner === 'second'
          ? t('status.result.blackWin')
          : t('status.result.draw');
    const reasonKey: MessageKey | null =
      snapshot.result.reason === 'mate'
        ? 'status.reason.mate'
        : snapshot.result.reason === 'stalemate'
          ? 'status.reason.stalemate'
          : snapshot.result.reason === 'resign'
            ? 'status.reason.resign'
            : null;
    const reason = reasonKey !== null ? ` · ${t(reasonKey)}` : '';
    return { text: `${winner}${reason}`, tone: 'neutral' };
  }
  if (snapshot.phase !== 'playing') {
    return { text: t('status.reviewing'), tone: 'neutral' };
  }
  if (snapshot.thinking) {
    return { text: t('status.thinking'), tone: 'busy' };
  }
  return {
    text: t(snapshot.turn === 'first' ? 'status.turn.red' : 'status.turn.black'),
    tone: 'neutral',
    check: snapshot.inCheck ? t('status.check') : undefined,
  };
}

function engineStatusLabel(
  t: TFunction,
  status: EngineStatusPayload['status'] | undefined,
): string {
  if (status === undefined) return '—';
  const key = `panel.engine.status.${status}` as MessageKey;
  return t(key);
}

function evalTextOf(props: SidePanelProps): string {
  const { snapshot, liveEval } = props;
  // liveEval 是思考中的瞬时帧：引擎停止/悔棋/跳转后不清空，须以 thinking 门控，
  // 否则最后一帧（如"#3 绝杀"）一直遮蔽 snapshot 里的当前局面评估
  const live = snapshot?.thinking === true ? liveEval : null;
  const cp = live?.redCp ?? snapshot?.redCp;
  const mate = live?.redMate ?? snapshot?.redMate;
  return evalValueText(props.t, cp, mate).text;
}
