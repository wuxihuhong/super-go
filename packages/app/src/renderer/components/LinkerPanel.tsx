import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActiveWindowPickReason,
  LinkerLogEntry,
  LinkerPermissionId,
  LinkerPermissionState,
  LinkerResolution,
  LinkerStartIntent,
  LinkerStatus,
  TargetWindow,
} from '@shared/ipc';
import type { GameKind } from '@super-go/core';
import type { MessageKey, TFunction } from '../i18n';
import { visibleWindows } from '../lib/windowFilter';
import { LinkerResolveActions, linkerPhaseActive } from './LinkerLiveStatus';

export interface LinkerPanelProps {
  t: TFunction;
  status: LinkerStatus | null;
  logs: LinkerLogEntry[];
  /** 当前棋盘棋种；连线不再单独选棋种 */
  kind: GameKind;
  onStart: (intent: LinkerStartIntent) => void;
  onStop: () => void;
  onPauseToggle: () => void;
  onResolve: (resolution: LinkerResolution) => void;
}

const PERMISSION_LABEL: Record<LinkerPermissionId, MessageKey> = {
  screen: 'linker.permission.screen',
  accessibility: 'linker.permission.accessibility',
  'input-monitoring': 'linker.permission.inputMonitoring',
};

const PICK_REASON_KEY: Record<ActiveWindowPickReason, MessageKey> = {
  self: 'linker.window.pick.self',
  tooSmall: 'linker.window.pick.tooSmall',
  emptyTitle: 'linker.window.pick.emptyTitle',
  noHandle: 'linker.window.pick.noHandle',
  error: 'linker.window.pick.error',
};

/** 面板随 popover 卸载；筛选字要跨开关保存，只在点「刷新」时清空 */
let savedWindowFilter = '';

/**
 * 连线面板（§6.1）：选目标窗口 → 启动。
 * 即时状态与报错在侧栏着法区（LinkerLiveStatus），此处只保留选窗 / 权限 / 启停 / 日志。
 */
export default function LinkerPanel(props: LinkerPanelProps) {
  const [windows, setWindows] = useState<TargetWindow[] | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [filter, setFilterState] = useState(savedWindowFilter);
  const [permissions, setPermissions] = useState<LinkerPermissionState[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pickReason, setPickReason] = useState<ActiveWindowPickReason | null>(null);
  const countdownTimer = useRef<number | null>(null);

  const active = linkerPhaseActive(props.status);
  const t = props.t;

  const setFilter = (value: string): void => {
    savedWindowFilter = value;
    setFilterState(value);
  };

  const visible = useMemo(() => {
    if (windows === null) return null;
    return visibleWindows(windows, filter, windowId);
  }, [windows, filter, windowId]);

  const loadWindows = useCallback(() => {
    void window.superGo.linkerListWindows().then((list) => {
      setWindows(list);
    });
  }, []);

  const refreshWindows = (): void => {
    setFilter('');
    loadWindows();
  };

  useEffect(() => {
    loadWindows();
    void window.superGo.linkerPermissions().then(setPermissions);
    return () => {
      if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current);
    };
  }, [loadWindows]);

  useEffect(() => {
    if (windows === null) return;
    setWindowId((cur) => {
      if (cur !== null && windows.some((w) => w.id === cur)) return cur;
      return windows[0]?.id ?? null;
    });
  }, [windows]);

  const canStart =
    windowId !== null && visible !== null && visible.some((w) => w.id === windowId);

  /** "切换到目标窗口后确认"：3 秒倒计时后取前台窗口 */
  const pickActiveWindow = (): void => {
    if (countdown !== null) return;
    let remain = 3;
    setPickReason(null);
    setCountdown(remain);
    countdownTimer.current = window.setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        window.clearInterval(countdownTimer.current!);
        countdownTimer.current = null;
        setCountdown(null);
        void window.superGo.linkerActiveWindow().then((pick) => {
          if (pick.ok) {
            const win = pick.window;
            setWindows((cur) => [win, ...(cur ?? []).filter((w) => w.id !== win.id)]);
            setWindowId(win.id);
            setPickReason(null);
          } else {
            setPickReason(pick.reason);
          }
        });
        return;
      }
      setCountdown(remain);
    }, 1000);
  };

  const start = (): void => {
    if (!canStart || windowId === null) return;
    props.onStart({ windowId, kind: props.kind });
  };

  const emptyText =
    windows !== null && windows.length > 0 && visible !== null && visible.length === 0
      ? t('linker.window.noMatch')
      : t('linker.window.empty');

  return (
    <div className="max-h-[80vh] w-96 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
      <section className="mb-3">
        <h3 className="mb-1.5 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
          <span>{t('linker.window')}</span>
          <button
            type="button"
            onClick={refreshWindows}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground transition-colors hover:text-accent"
          >
            {t('linker.window.refresh')}
          </button>
        </h3>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('linker.window.filter')}
          aria-label={t('linker.window.filter')}
          className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
          {visible === null ? null : visible.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            visible.map((w) => (
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
        {pickReason !== null && (
          <p className="mt-1 px-1 text-[11px] leading-snug text-danger">
            {t(PICK_REASON_KEY[pickReason])}
          </p>
        )}
      </section>

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
                  {t(PERMISSION_LABEL[p.id])}
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

      <section>
        {active ? (
          <div className="flex flex-col gap-2">
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
            {props.status?.phase === 'attention' && (
              <LinkerResolveActions t={t} onResolve={props.onResolve} />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-40"
          >
            {t('linker.start')}
          </button>
        )}
      </section>

      {props.logs.length > 0 && (
        <section className="mt-3">
          <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
            {t('linker.log')}
          </h3>
          <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {props.logs.slice(-12).map((entry, i) => (
              <div
                key={`${entry.time}-${i}`}
                className={
                  entry.level === 'warn'
                    ? 'text-foreground'
                    : entry.level === 'error'
                      ? 'text-danger'
                      : ''
                }
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
