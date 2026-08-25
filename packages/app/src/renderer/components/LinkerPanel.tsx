import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LinkerLogEntry,
  LinkerPermissionState,
  LinkerReason,
  LinkerResolution,
  LinkerStartIntent,
  LinkerStatus,
  TargetWindow,
} from '@shared/ipc';
import type { TFunction } from '../i18n';

export interface LinkerPanelProps {
  t: TFunction;
  status: LinkerStatus | null;
  logs: LinkerLogEntry[];
  onStart: (intent: LinkerStartIntent) => void;
  onStop: () => void;
  onPauseToggle: () => void;
  onResolve: (resolution: LinkerResolution) => void;
}

const ACTIVE_PHASES: ReadonlySet<string> = new Set([
  'locating',
  'initializing',
  'scanning',
  'thinking',
  'clicking',
  'paused',
  'attention', // 待人工介入时连线仍在跑（§6.6），面板保持激活形态
]);

/** 待人工介入时给出的决断按钮（顺序 = 推荐顺序） */
const RESOLUTIONS: readonly LinkerResolution[] = ['retry', 'resync', 'spectate'];

/** 用户主动停止不算"出问题"，不显示告警块 */
const SILENT_REASONS: ReadonlySet<LinkerReason> = new Set<LinkerReason>(['user', 'shortcut']);

const PHASE_KEY: Record<string, string> = {
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

/**
 * 连线面板（§6.1）：选目标窗口 → 选模式（执红/执黑/观战）→ 启动；
 * 激活后显示识别状态与日志，可暂停/停止（全局急停 ⌘/Ctrl+Shift+X 在
 * main 注册）。macOS 权限不足时给授权引导。
 */
export default function LinkerPanel(props: LinkerPanelProps) {
  const [windows, setWindows] = useState<TargetWindow[] | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<LinkerPermissionState[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<number | null>(null);

  const active = props.status !== null && ACTIVE_PHASES.has(props.status.phase);
  const t = props.t;

  const refreshWindows = useCallback(() => {
    void window.superGo.linkerListWindows().then((list) => {
      setWindows(list);
      setWindowId((cur) => (cur !== null && list.some((w) => w.id === cur) ? cur : (list[0]?.id ?? null)));
    });
  }, []);

  useEffect(() => {
    refreshWindows();
    void window.superGo.linkerPermissions().then(setPermissions);
    return () => {
      if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current);
    };
  }, [refreshWindows]);

  /** "切换到目标窗口后确认"：3 秒倒计时后取前台窗口 */
  const pickActiveWindow = (): void => {
    if (countdown !== null) return;
    let remain = 3;
    setCountdown(remain);
    countdownTimer.current = window.setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        window.clearInterval(countdownTimer.current!);
        countdownTimer.current = null;
        setCountdown(null);
        void window.superGo.linkerActiveWindow().then((win) => {
          if (win !== null) {
            setWindows((cur) => [win, ...(cur ?? []).filter((w) => w.id !== win.id)]);
            setWindowId(win.id);
          }
        });
        return;
      }
      setCountdown(remain);
    }, 1000);
  };

  const start = (): void => {
    if (windowId === null) return;
    props.onStart({ windowId });
  };

  return (
    <div className="max-h-[80vh] w-96 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
      {/* 目标窗口 */}
      <section className="mb-3">
        <h3 className="mb-1.5 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
          <span>{t('linker.window')}</span>
          <span className="flex items-center gap-1 font-normal">
            <button
              type="button"
              onClick={refreshWindows}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-accent"
            >
              {t('linker.window.refresh')}
            </button>
          </span>
        </h3>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
          {windows === null ? null : windows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{t('linker.window.empty')}</div>
          ) : (
            windows.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWindowId(w.id)}
                className={`block w-full truncate px-3 py-1.5 text-left text-xs transition-colors ${
                  windowId === w.id
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground/80 hover:bg-foreground/5'
                }`}
                title={w.title}
              >
                {w.title}
                <span className="ml-1.5 text-muted-foreground">
                  {w.region.width}×{w.region.height}
                </span>
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={pickActiveWindow}
          disabled={active}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {countdown !== null
            ? t('linker.window.pickActive.countdown').replace('{s}', String(countdown))
            : t('linker.window.pickActive')}
        </button>
      </section>

      {/* macOS 权限 */}
      {!active && permissions.length > 0 && (
        <section className="mb-3">
          <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
            {t('linker.permission')}
          </h3>
          <div className="divide-y divide-border rounded-lg border border-border bg-background">
            {permissions.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${p.granted ? 'bg-accent' : 'bg-danger'}`}
                  />
                  {t(`linker.permission.${p.id}` as never)}
                </span>
                {p.granted ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t('linker.permission.granted')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.superGo.linkerAskPermission(p.id)}
                    className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    {t('linker.permission.grant')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 状态与控制 */}
      <section>
        <h3 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              !active
                ? 'bg-muted-foreground/50'
                : props.status?.phase === 'attention'
                  ? 'bg-danger'
                  : props.status?.phase === 'paused'
                    ? 'bg-muted-foreground'
                    : 'animate-pulse bg-accent'
            }`}
          />
          {t((PHASE_KEY[props.status?.phase ?? 'idle'] ?? 'linker.phase.idle') as never)}
          {active && props.status !== null && (
            <span className="font-normal text-muted-foreground">
              ·{' '}
              {t('linker.status.fps')
                .replace('{fps}', String(props.status.fps))
                .replace('{ms}', String(props.status.inferMs))}
              {props.status.reversed ? ` · ${t('linker.status.reversed')}` : ''}
            </span>
          )}
        </h3>
        {active && props.status !== null && (
          <div className="mb-1.5 px-1 text-[11px] text-muted-foreground">
            {t('linker.status.moves').replace('{n}', String(props.status.moves))} ·{' '}
            {t('linker.emergency')}
          </div>
        )}
        {/* 出问题时的原因 + 建议 + 决断（§6.6）：连线不再无声终止 */}
        {props.status !== null &&
          props.status.reason !== null &&
          !SILENT_REASONS.has(props.status.reason) && (
            <div className="mb-2 rounded-lg border border-danger/40 bg-danger/5 p-2.5">
              <div className="text-xs font-medium text-danger">
                {t(`linker.reason.${props.status.reason}` as never)}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t(`linker.reason.${props.status.reason}.hint` as never)}
              </div>
              {props.status.message !== null && (
                <div className="mt-1 font-mono text-[10px] break-all text-muted-foreground/70">
                  {props.status.message}
                </div>
              )}
              {props.status.phase === 'attention' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RESOLUTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => props.onResolve(r)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground/80 transition-colors hover:border-accent hover:text-accent"
                    >
                      {t(`linker.resolve.${r}` as never)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        {active ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onStop}
              className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-background"
            >
              {t('linker.stop')}
            </button>
            <button
              type="button"
              onClick={props.onPauseToggle}
              className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {props.status?.phase === 'paused' ? t('linker.resume') : t('linker.pause')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={windowId === null}
            className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-40"
          >
            {t('linker.start')}
          </button>
        )}
      </section>

      {/* 日志 */}
      {props.logs.length > 0 && (
        <section className="mt-3">
          <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
            {t('linker.log')}
          </h3>
          <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {props.logs.slice(-12).map((entry, i) => (
              <div
                key={`${entry.time}-${i}`}
                className={entry.level === 'warn' ? 'text-foreground' : entry.level === 'error' ? 'text-danger' : ''}
              >
                [{new Date(entry.time).toLocaleTimeString()}] {entry.text}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
