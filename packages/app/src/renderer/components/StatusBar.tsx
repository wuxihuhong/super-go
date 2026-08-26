import type { GameSnapshot } from '@shared/game';
import type { EngineStatusPayload, LiveEval } from '@shared/ipc';
import { evalValueText } from '../lib/eval';
import type { MessageKey, TFunction } from '../i18n';

export interface StatusBarProps {
  t: TFunction;
  snapshot: GameSnapshot | null;
  engineStatus: EngineStatusPayload | null;
  liveEval: LiveEval | null;
  boardFlipped: boolean;
}

/** 窗口底栏：引擎 / 状态 / 强度 / 深度 / 优势（侧栏不再竖排这些字段） */
export default function StatusBar(props: StatusBarProps): React.JSX.Element {
  const { t, snapshot, engineStatus } = props;
  const live = snapshot?.thinking === true ? props.liveEval : null;
  const evalText = evalValueText(
    t,
    live?.redCp ?? snapshot?.redCp,
    live?.redMate ?? snapshot?.redMate,
    props.boardFlipped,
  );
  const depth =
    snapshot?.thinking === true && live?.depth !== undefined ? String(live.depth) : '—';
  const statusKey =
    engineStatus === undefined || engineStatus === null
      ? null
      : (`panel.engine.status.${engineStatus.status}` as MessageKey);

  return (
    <footer className="flex h-8 shrink-0 items-center gap-x-5 overflow-x-auto border-t border-border bg-surface px-4 text-xs">
      <Item label={t('panel.engine')} value={engineStatus?.name ?? '—'} />
      <Item label={t('statusbar.status')} value={statusKey !== null ? t(statusKey) : '—'} />
      <Item
        label={t('panel.engine.strength')}
        value={snapshot?.strengthLabel ?? t('panel.engine.unlimited')}
      />
      <Item label={t('panel.engine.depth')} value={depth} />
      <Item label={t('panel.engine.eval')} value={evalText.text} />
    </footer>
  );
}

function Item(props: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="tabular-nums text-foreground">{props.value}</span>
    </span>
  );
}
