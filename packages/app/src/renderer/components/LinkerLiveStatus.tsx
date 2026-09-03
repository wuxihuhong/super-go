import {
  isLinkerActivePhase,
  type LinkerPhase,
  type LinkerReason,
  type LinkerResolution,
  type LinkerStatus,
  type LocateHint,
} from '@shared/ipc';
import type { MessageKey, TFunction } from '../i18n';

export interface LinkerLiveStatusProps {
  t: TFunction;
  status: LinkerStatus;
  onStop: () => void;
  onPauseToggle: () => void;
  onResolve: (resolution: LinkerResolution) => void;
  onDismiss?: () => void;
}

const SILENT_REASONS: ReadonlySet<LinkerReason> = new Set<LinkerReason>(['user', 'shortcut']);

const PHASE_KEY: Record<LinkerPhase, MessageKey> = {
  idle: 'linker.phase.idle',
  locating: 'linker.phase.locating',
  initializing: 'linker.phase.initializing',
  scanning: 'linker.phase.scanning',
  thinking: 'linker.phase.thinking',
  clicking: 'linker.phase.clicking',
  paused: 'linker.phase.paused',
  attention: 'linker.phase.attention',
  error: 'linker.phase.error',
  stopped: 'linker.phase.stopped',
};

const REASON_KEY: Record<LinkerReason, MessageKey> = {
  user: 'linker.reason.user',
  shortcut: 'linker.reason.shortcut',
  clickChannel: 'linker.reason.clickChannel',
  platformUnresponsive: 'linker.reason.platformUnresponsive',
  boardLost: 'linker.reason.boardLost',
  boardMismatch: 'linker.reason.boardMismatch',
  engineUnavailable: 'linker.reason.engineUnavailable',
  crashed: 'linker.reason.crashed',
  gameOver: 'linker.reason.gameOver',
};

const REASON_HINT_KEY: Partial<Record<LinkerReason, MessageKey>> = {
  clickChannel: 'linker.reason.clickChannel.hint',
  platformUnresponsive: 'linker.reason.platformUnresponsive.hint',
  boardLost: 'linker.reason.boardLost.hint',
  boardMismatch: 'linker.reason.boardMismatch.hint',
  engineUnavailable: 'linker.reason.engineUnavailable.hint',
  crashed: 'linker.reason.crashed.hint',
  gameOver: 'linker.reason.gameOver.hint',
};

const LOCATE_KEY: Record<LocateHint, MessageKey> = {
  captureFailed: 'linker.locate.captureFailed',
  noBoard: 'linker.locate.noBoard',
  lowConfidence: 'linker.locate.lowConfidence',
  noKing: 'linker.locate.noKing',
  invalidBoard: 'linker.locate.invalidBoard',
};

const LOCATE_HINT_KEY: Record<LocateHint, MessageKey> = {
  captureFailed: 'linker.locate.captureFailed.hint',
  noBoard: 'linker.locate.noBoard.hint',
  lowConfidence: 'linker.locate.lowConfidence.hint',
  noKing: 'linker.locate.noKing.hint',
  invalidBoard: 'linker.locate.invalidBoard.hint',
};

const RESOLVE_KEY: Record<LinkerResolution, MessageKey> = {
  retry: 'linker.resolve.retry',
  resync: 'linker.resolve.resync',
  spectate: 'linker.resolve.spectate',
};

const RESOLUTIONS: readonly LinkerResolution[] = ['retry', 'resync', 'spectate'];

export function linkerLiveVisible(status: LinkerStatus | null): boolean {
  if (status === null) return false;
  if (linkerPhaseActive(status)) return true;
  if (status.phase === 'error') return true;
  if (status.locateHint !== null) return true;
  return status.reason !== null && !SILENT_REASONS.has(status.reason);
}

export function linkerPhaseActive(status: LinkerStatus | null): boolean {
  return status !== null && isLinkerActivePhase(status.phase);
}

function phaseTone(phase: LinkerPhase): { dot: string; pulse: boolean } {
  switch (phase) {
    case 'idle':
    case 'stopped':
      return { dot: 'bg-dim2', pulse: false };
    case 'locating':
    case 'initializing':
      return { dot: 'bg-acc', pulse: true };
    case 'scanning':
    case 'thinking':
    case 'clicking':
      return { dot: 'bg-ok', pulse: true };
    case 'paused':
      return { dot: 'bg-dim', pulse: false };
    case 'attention':
    case 'error':
      return { dot: 'bg-danger', pulse: false };
    default:
      return { dot: 'bg-dim2', pulse: false };
  }
}

export default function LinkerLiveStatus(props: LinkerLiveStatusProps): React.JSX.Element {
  const { t, status } = props;
  const active = isLinkerActivePhase(status.phase);
  const reason = status.reason;
  const showReason = reason !== null && !SILENT_REASONS.has(reason);
  const hintKey = reason !== null ? (REASON_HINT_KEY[reason] ?? null) : null;
  const locateHint = status.phase === 'locating' ? status.locateHint : null;
  const tone = phaseTone(status.phase);
  const titleTone =
    status.phase === 'error' || status.phase === 'attention'
      ? 'text-danger-txt'
      : status.phase === 'paused' || status.phase === 'idle'
        ? 'text-dim'
        : 'text-ok-txt';

  return (
    <div className="rounded-[9px] border border-[color:var(--ok-line)] bg-[color:var(--ok-bg)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot} ${tone.pulse ? 'sg-pulse' : ''}`}
        />
        <span className={`min-w-0 truncate font-mono text-[10.5px] font-bold tracking-[0.06em] ${titleTone}`}>
          {t('linker.title')} · {t(PHASE_KEY[status.phase])}
        </span>
        {active && (
          <span className="ml-auto font-mono text-[9.5px] font-semibold text-dim2">
            {status.fps}FPS {status.inferMs}MS
          </span>
        )}
      </div>
      {active && (
        <div className="mt-1 truncate font-mono text-[10.5px] text-dim">
          {t('linker.status.moves').replace('{n}', String(status.moves))}
          {status.reversed ? ` · ${t('linker.status.reversed')}` : ''}
          {` · ${t('linker.emergency')}`}
        </div>
      )}
      {locateHint !== null && (
        <div className="mt-2 rounded-lg border border-[color:var(--line)] bg-background p-2.5">
          <div className="text-xs text-foreground">{t(LOCATE_KEY[locateHint])}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-dim">{t(LOCATE_HINT_KEY[locateHint])}</div>
        </div>
      )}
      {showReason && reason !== null && (
        <div className="mt-2 rounded-lg border border-[color:var(--danger-line)] bg-[color:var(--danger-bg)] p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-danger-txt">{t(REASON_KEY[reason])}</div>
            {props.onDismiss !== undefined && !active && (
              <button
                type="button"
                onClick={props.onDismiss}
                className="shrink-0 text-[11px] text-dim hover:text-foreground"
              >
                {t('linker.status.dismiss')}
              </button>
            )}
          </div>
          {hintKey !== null && (
            <div className="mt-1 text-[11px] leading-relaxed text-dim">{t(hintKey)}</div>
          )}
          {status.message !== null && (
            <div className="mt-1 font-mono text-[10px] break-all text-dim/70">{status.message}</div>
          )}
        </div>
      )}
      {active && (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={props.onStop}
            className="flex-1 rounded-md border border-[color:var(--danger-line)] bg-[color:var(--danger-bg)] py-1.5 font-mono text-[10.5px] font-semibold text-danger-txt"
          >
            {t('linker.stop')}
          </button>
          <button
            type="button"
            onClick={props.onPauseToggle}
            className="flex-1 rounded-md border border-[color:var(--line)] py-1.5 font-mono text-[10.5px] font-semibold text-dim"
          >
            {status.phase === 'paused' ? t('linker.resume') : t('linker.pause')}
          </button>
        </div>
      )}
      {status.phase === 'attention' && <LinkerResolveActions t={t} onResolve={props.onResolve} />}
    </div>
  );
}

export function LinkerResolveActions(props: {
  t: TFunction;
  onResolve: (resolution: LinkerResolution) => void;
}): React.JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => props.onResolve(r)}
          className="rounded-md border border-[color:var(--line)] bg-background px-2 py-1 text-[11px] text-foreground/80 hover:border-acc hover:text-acc"
        >
          {props.t(RESOLVE_KEY[r])}
        </button>
      ))}
    </div>
  );
}
