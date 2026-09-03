import { useEffect, useRef, useState } from 'react';
import type { LinkerResolution, LinkerStatus, LiveEval } from '@shared/ipc';
import type { GameSnapshot } from '@shared/game';
import EvalChart from './EvalChart';
import LinkerLiveStatus, { linkerLiveVisible } from './LinkerLiveStatus';
import type { TFunction } from '../i18n';
import { buildGauge, buildTelemetry, moveEvalCell, statusBanner } from '../lib/consoleData';

const PANEL_MIN = 300;
const PANEL_MAX = 480;
const PANEL_DEFAULT = 348;
const TREND_KEY = 'sidepanel-eval-trend';

export interface SidePanelProps {
  t: TFunction;
  snapshot: GameSnapshot | null;
  themeTick: number;
  onGoto: (nodeId: number) => void;
  onContinue: () => void;
  liveEval: LiveEval | null;
  engineStatus: import('@shared/ipc').EngineStatusPayload | null;
  linkerStatus: LinkerStatus | null;
  onLinkerStop: () => void;
  onLinkerPauseToggle: () => void;
  onLinkerResolve: (resolution: LinkerResolution) => void;
  onLinkerDismiss: () => void;
  open: boolean;
  overlay: boolean;
}

export default function SidePanel(props: SidePanelProps) {
  const { snapshot } = props;
  const browsing = snapshot !== null && snapshot.phase !== 'playing';
  const status = statusBanner(props.t, snapshot);
  const canContinue = snapshot !== null && browsing && snapshot.moves.length > 0;
  const gauge = buildGauge(props.t, snapshot, props.liveEval);
  const telemetry = buildTelemetry(props.t, snapshot, props.engineStatus, props.liveEval);
  const go = snapshot?.kind === 'go';

  const [width, setWidth] = useState((): number => {
    const saved = Number(window.localStorage.getItem('sidepanel-width'));
    return Number.isFinite(saved) && saved >= PANEL_MIN && saved <= PANEL_MAX
      ? saved
      : PANEL_DEFAULT;
  });
  const [trendOpen, setTrendOpen] = useState(
    () => window.localStorage.getItem(TREND_KEY) !== '0',
  );
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
  const onHandleUp = (): void => {
    const d = drag.current;
    if (d === null) return;
    drag.current = null;
    window.localStorage.setItem('sidepanel-width', String(d.width));
  };

  const shownWidth = props.open ? width : 0;
  const trendValue =
    gauge.kind === 'go' ? `${gauge.leftValue}%` : gauge.leftValue;

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-l border-[color:var(--line)] [background:var(--sidebar)] transition-[width,opacity] duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] ${
        props.overlay ? 'absolute inset-y-0 right-0 z-20 shadow-xl' : ''
      }`}
      style={{ width: shownWidth, opacity: props.open ? 1 : 0 }}
      aria-hidden={!props.open}
    >
      <div className="flex min-h-0 w-full min-w-[300px] flex-1 flex-col" style={{ width }}>
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onLostPointerCapture={onHandleUp}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-acc/40"
        />

        <div className="border-b border-[color:var(--hair)] px-[18px] pt-4 pb-3.5">
          <div className="mb-2 flex min-h-5 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                status.tone === 'danger'
                  ? 'bg-danger'
                  : status.tone === 'busy'
                    ? 'sg-pulse bg-acc'
                    : 'bg-dim2'
              }`}
            />
            <span className="truncate text-xs text-foreground">{status.text}</span>
            {status.check !== undefined && (
              <span className="ml-auto rounded border border-danger px-1.5 py-0.5 text-[10px] text-danger">
                {status.check}
              </span>
            )}
          </div>
          {canContinue && (
            <button
              type="button"
              onClick={props.onContinue}
              className="sg-btn-solid mb-3 w-full rounded-md px-3 py-1.5 text-xs font-medium"
            >
              {props.t('setup.continueFrom')}
            </button>
          )}
          <div className="mb-2.5 flex items-end justify-between">
            <div>
              <div className="sg-label mb-1">{gauge.leftLabel}</div>
              <div
                className={`font-mono text-[32px] leading-none font-bold [text-shadow:var(--glow-text)] ${
                  gauge.leftTone === 'pink' ? 'text-pink-txt' : 'text-acc'
                }`}
              >
                {gauge.leftValue}
                {gauge.kind === 'go' && (
                  <span className="ml-0.5 text-[12px] font-semibold text-dim2">%</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="sg-label mb-1">{gauge.rightLabel}</div>
              <div
                className={`font-mono text-xl leading-none font-bold ${
                  gauge.kind === 'go' ? 'text-pink-txt' : 'text-foreground'
                }`}
              >
                {gauge.rightValue}
                {gauge.kind === 'go' && (
                  <span className="ml-0.5 text-[12px] font-semibold text-dim2">%</span>
                )}
              </div>
            </div>
          </div>
          <div className="relative flex h-2 overflow-hidden rounded-sm border border-[color:var(--line)] bg-[color:var(--track)]">
            <span
              className="h-full [background:var(--bar-black)] [box-shadow:var(--bar-black-glow)]"
              style={{ width: `${Math.round(gauge.barRatio * 100)}%` }}
            />
            {gauge.kind === 'xiangqi' && (
              <span className="absolute left-1/2 h-2 w-px bg-[color:var(--line)]" />
            )}
            <span className="h-full flex-1 [background:var(--bar-white)]" />
          </div>
        </div>

        <div className="flex flex-col gap-[9px] border-b border-[color:var(--hair)] px-[18px] py-3">
          {telemetry.map((row) => (
            <div key={row.id}>
              <div className="mb-1 flex justify-between font-mono text-[9.5px] font-semibold tracking-[0.06em]">
                <span className="text-dim2">{row.label}</span>
                <span className="text-foreground">{row.value}</span>
              </div>
              {row.bar !== undefined && (
                <div className="h-[3px] overflow-hidden rounded-sm bg-[color:var(--tele-track)]">
                  <div
                    className="h-full [background:var(--tele)]"
                    style={{
                      width: `${Math.round((row.barRatio ?? 0) * 100)}%`,
                      background: row.bar === 'pink' ? 'var(--bar-white)' : undefined,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-[18px] pt-3 pb-1.5">
            <h2 className="sg-label">{props.t('panel.moveLog')}</h2>
            <span className="font-mono text-[9.5px] font-semibold tracking-[0.06em] text-dim2">
              {props
                .t(go ? 'panel.moveLog.ply' : 'panel.moveLog.rounds')
                .replace(
                  '{n}',
                  String(go ? (snapshot?.moves.length ?? 0) : Math.ceil((snapshot?.moves.length ?? 0) / 2)),
                )}
            </span>
          </div>
          <MoveList t={props.t} snapshot={snapshot} browsing={browsing} onGoto={props.onGoto} />
          {linkerLiveVisible(props.linkerStatus) && props.linkerStatus !== null && (
            <div className="mx-3 mb-2.5">
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

        <div className="border-t border-[color:var(--hair)] px-[18px] pt-2.5 pb-3.5">
          <button
            type="button"
            onClick={() => {
              const next = !trendOpen;
              setTrendOpen(next);
              window.localStorage.setItem(TREND_KEY, next ? '1' : '0');
            }}
            className="mb-1 flex w-full items-center justify-between"
          >
            <span className="sg-label">{props.t('panel.trend')}</span>
            <span className="font-mono text-[9.5px] font-semibold tracking-[0.2em] text-dim2">
              {trendValue}
            </span>
          </button>
          {trendOpen && (
            <EvalChart
              moves={snapshot?.moves ?? []}
              liveEval={props.liveEval}
              themeTick={props.themeTick}
              emptyText={props.t('panel.chart.empty')}
              mode={go ? 'winRate' : 'cp'}
            />
          )}
        </div>
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
  const kind = snapshot?.kind === 'go' ? 'go' : 'xiangqi';
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [moves.length]);

  const rows: Array<{ num: number; red?: (typeof moves)[number]; black?: (typeof moves)[number] }> =
    [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ num: i / 2 + 1, red: moves[i], black: moves[i + 1] });
  }

  const evalOf = (item: (typeof moves)[number] | undefined): React.JSX.Element => {
    if (item === undefined) return <span className="w-11 shrink-0 text-right text-eval-none">—</span>;
    const cell = moveEvalCell(item, kind);
    const color =
      cell.tone === 'pos' ? 'text-eval-pos' : cell.tone === 'neg' ? 'text-eval-neg' : 'text-eval-none';
    return <span className={`w-11 shrink-0 text-right font-mono tabular-nums ${color}`}>{cell.text}</span>;
  };

  const moveBtn = (
    item: (typeof moves)[number] | undefined,
    ply: 0 | 1,
  ): React.JSX.Element => {
    if (item === undefined) return <span className="min-w-0 flex-1" />;
    const sideColor =
      ply === 0 ? (kind === 'go' ? 'text-foreground' : 'text-pink-txt') : 'text-dim';
    return (
      <button
        type="button"
        disabled={!browsing}
        onClick={() => onGoto(item.nodeId)}
        title={item.iccs}
        className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left font-mono text-[11.5px] tabular-nums ${sideColor} ${
          browsing ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {item.notation}
      </button>
    );
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
      <div className="flex items-center gap-1.5 px-2 pb-1 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-dim2">
        <span className="w-6 shrink-0" />
        <span className="min-w-0 flex-1">
          {t(kind === 'go' ? 'side.blackGo' : 'side.red')}
        </span>
        <span className="min-w-0 flex-1">
          {t(kind === 'go' ? 'side.whiteGo' : 'side.black')}
        </span>
        <span className="w-11 shrink-0 text-right">{t('panel.moveLog.eval')}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-2 pt-2 text-xs text-dim">{t('panel.empty')}</p>
      ) : (
        <ol>
          {rows.map((row) => {
            const current =
              (row.red !== undefined && snapshot?.cursorNodeId === row.red.nodeId) ||
              (row.black !== undefined && snapshot?.cursorNodeId === row.black.nodeId);
            return (
              <li
                key={row.num}
                className={`flex items-center gap-1.5 rounded-[5px] border-l-2 px-2 py-1 font-mono text-[11.5px] ${
                  current
                    ? 'border-acc bg-[color:var(--acc-bg)]'
                    : 'border-transparent hover:bg-[color:var(--acc-bg)]/50'
                }`}
              >
                <span className="w-6 shrink-0 text-dim2 tabular-nums">{row.num}</span>
                {moveBtn(row.red, 0)}
                {moveBtn(row.black, 1)}
                {evalOf(row.black ?? row.red)}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
