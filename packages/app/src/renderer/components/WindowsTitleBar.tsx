import type { GameKind } from '@super-go/core';
import type { GameSnapshot } from '@shared/game';
import type { TFunction } from '../i18n';
import { windowSubtitle } from '../lib/consoleData';
import { AppMark } from './AppMark';

const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
/** WCO 的 titlebar-area-width 是可用区宽度，不是系统按钮占位（3×46=138） */
const TITLE_AREA = {
  ...DRAG,
  width: 'env(titlebar-area-width, calc(100% - 138px))',
} as React.CSSProperties;

export function WindowsTitleBar(props: {
  t: TFunction;
  kind: GameKind;
  snapshot: GameSnapshot | null;
  onOpenAbout: () => void;
}): React.JSX.Element {
  return (
    <div className="relative z-30 h-8 shrink-0 bg-[color:var(--win-title)]">
      <div style={TITLE_AREA} className="flex h-full min-w-0 items-center">
        <button
          type="button"
          style={NO_DRAG}
          onClick={props.onOpenAbout}
          className="ml-3 flex shrink-0 items-center gap-[9px] whitespace-nowrap text-[12px] font-semibold leading-none text-dim"
        >
          <AppMark className="h-4 w-4 shrink-0 rounded-[4px]" />
          Super-Go
        </button>
        <span className="mx-[3px] h-[14px] w-px shrink-0 bg-[color:var(--line)]" aria-hidden />
        <span className="min-w-0 truncate text-[12px] leading-none text-dim2">
          {windowSubtitle(props.t, props.snapshot, props.kind)}
        </span>
      </div>
    </div>
  );
}
