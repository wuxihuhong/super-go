import type { GameSnapshot } from '@shared/game';
import type { EngineStatusPayload, LiveEval } from '@shared/ipc';
import { engineStatusText } from '../lib/engineStatusText';
import { evalValueText, resolveDisplayedEval } from '../lib/eval';
import type { TFunction } from '../i18n';

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
  const shown = resolveDisplayedEval(props.liveEval, snapshot);
  const evalText = evalValueText(t, shown.redCp, shown.redMate, props.boardFlipped);
  const depth = shown.depth !== undefined ? String(shown.depth) : '—';

  const items = [
    { label: t('panel.engine'), value: engineStatus?.name ?? '—' },
    {
      label: t('statusbar.status'),
      value: engineStatusText(t, engineStatus, snapshot?.playDelaySec),
    },
    {
      label: t('panel.engine.strength'),
      value: snapshot?.strengthLabel ?? t('panel.engine.unlimited'),
    },
    { label: t('panel.engine.depth'), value: depth },
    { label: t('panel.engine.eval'), value: evalText.text },
  ];

  return (
    <footer className="flex h-8 shrink-0 items-center overflow-x-auto border-t border-border bg-surface px-4 text-xs">
      {items.map((item, i) => (
        <span key={item.label} className="flex shrink-0 items-center">
          {i > 0 && <span className="mx-4 h-3 w-px bg-muted-foreground/35" aria-hidden />}
          <Item label={item.label} value={item.value} />
        </span>
      ))}
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
