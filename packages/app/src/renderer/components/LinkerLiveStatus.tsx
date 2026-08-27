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

/** 侧栏着法区底部：连线进行中、出错、或有可关闭的停止原因时才占位 */
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

/**
 * 连线即时状态（§6.6）：阶段 / fps / 启停 / 原因码 / 待介入决断。
 * 挂在侧栏着法列表下方，不依赖连线弹层是否打开。
 */
export default function LinkerLiveStatus(props: LinkerLiveStatusProps): React.JSX.Element {
  const { t, status } = props;
  const active = isLinkerActivePhase(status.phase);
  const reason = status.reason;
  const showReason = reason !== null && !SILENT_REASONS.has(reason);
  const hintKey = reason !== null ? (REASON_HINT_KEY[reason] ?? null) : null;
  const locateHint = status.phase === 'locating' ? status.locateHint : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            !active
              ? 'bg-muted-foreground/50'
              : status.phase === 'attention'
                ? 'bg-danger'
                : status.phase === 'paused'
                  ? 'bg-muted-foreground'
                  : 'animate-pulse bg-accent'
          }`}
        />
        <span className="min-w-0 truncate text-foreground">{t(PHASE_KEY[status.phase])}</span>
        {active && (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {t('linker.status.fps')
              .replace('{fps}', String(status.fps))
              .replace('{ms}', String(status.inferMs))}
            {status.reversed ? ` · ${t('linker.status.reversed')}` : ''}
          </span>
        )}
      </div>
      {active && (
        <div className="text-[11px] text-muted-foreground">
          {t('linker.status.moves').replace('{n}', String(status.moves))} · {t('linker.emergency')}
        </div>
      )}
      {locateHint !== null && (
        <div className="rounded-lg border border-border bg-background p-2.5">
          <div className="text-xs text-foreground">{t(LOCATE_KEY[locateHint])}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t(LOCATE_HINT_KEY[locateHint])}
          </div>
        </div>
      )}
      {showReason && reason !== null && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-danger">{t(REASON_KEY[reason])}</div>
            {props.onDismiss !== undefined && !active && (
              <button
                type="button"
                onClick={props.onDismiss}
                className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('linker.status.dismiss')}
              </button>
            )}
          </div>
          {hintKey !== null && (
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t(hintKey)}
            </div>
          )}
          {status.message !== null && (
            <div className="mt-1 font-mono text-[10px] break-all text-muted-foreground/70">
              {status.message}
            </div>
          )}
        </div>
      )}
      {active && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={props.onStop}
            className="flex-1 rounded-md bg-danger px-2 py-1.5 text-[11px] font-medium text-background"
          >
            {t('linker.stop')}
          </button>
          <button
            type="button"
            onClick={props.onPauseToggle}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {status.phase === 'paused' ? t('linker.resume') : t('linker.pause')}
          </button>
        </div>
      )}
      {status.phase === 'attention' && (
        <LinkerResolveActions t={t} onResolve={props.onResolve} />
      )}
    </div>
  );
}

/** 待介入决断：侧栏与连线弹层共用，关掉侧栏后仍能从弹层点 */
export function LinkerResolveActions(props: {
  t: TFunction;
  onResolve: (resolution: LinkerResolution) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => props.onResolve(r)}
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground/80 transition-colors hover:border-accent hover:text-accent"
        >
          {props.t(RESOLVE_KEY[r])}
        </button>
      ))}
    </div>
  );
}
