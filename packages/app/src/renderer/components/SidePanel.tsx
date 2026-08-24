import { useEffect, useRef } from 'react';
import type { GameSnapshot } from '@shared/game';
import type { EngineStatusPayload, LiveEval } from '@shared/ipc';
import { evalLabel } from '../lib/eval';
import type { MessageKey, TFunction } from '../i18n';

export interface SidePanelProps {
  t: TFunction;
  snapshot: GameSnapshot | null;
  engineStatus: EngineStatusPayload | null;
  liveEval: LiveEval | null;
  onGoto: (nodeId: number) => void;
  onContinue: () => void;
}

/** 右侧可折叠面板：状态 + 着法列表 + 引擎信息（双方信息条在棋盘上下沿，§7.3） */
export default function SidePanel(props: SidePanelProps) {
  const { snapshot, engineStatus } = props;
  const browsing = snapshot !== null && snapshot.phase !== 'playing';
  const status = statusOf(props);
  const evalText = evalTextOf(props);
  const canContinue = snapshot !== null && browsing && snapshot.moves.length > 0;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface">
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
            value={props.liveEval?.depth !== undefined ? String(props.liveEval.depth) : '—'}
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
    return (
      <button
        type="button"
        disabled={!browsing}
        onClick={() => onGoto(item.nodeId)}
        title={item.iccs}
        className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left tabular-nums transition-colors ${
          active ? 'bg-accent/15 text-accent' : 'hover:bg-background'
        } ${ply === 1 ? 'text-muted-foreground' : ''} ${browsing ? 'cursor-pointer' : 'cursor-default'}`}
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
  const cp = liveEval?.redCp ?? snapshot?.redCp;
  const mate = liveEval?.redMate ?? snapshot?.redMate;
  if (cp === undefined && mate === undefined) return '—';
  return evalLabel(props.t, cp, mate);
}
