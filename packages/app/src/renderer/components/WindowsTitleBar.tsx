import type { GameKind } from '@super-go/core';
import type { GameSnapshot } from '@shared/game';
import type { TFunction } from '../i18n';
import { windowSubtitle } from '../lib/consoleData';
import { AppMark } from './AppMark';

const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function WindowsTitleBar(props: {
  t: TFunction;
  kind: GameKind;
  snapshot: GameSnapshot | null;
  onOpenAbout: () => void;
}): React.JSX.Element {
  return (
    <div
      style={DRAG}
      className="relative z-30 flex h-8 shrink-0 items-center bg-[color:var(--win-title)] pr-[env(titlebar-area-width,138px)]"
    >
      <button
        type="button"
        style={NO_DRAG}
        onClick={props.onOpenAbout}
        className="ml-3 flex items-center gap-[9px] text-[12px] font-semibold text-dim"
      >
        <AppMark className="h-4 w-4 rounded-[4px]" />
        Super-Go
      </button>
      <span className="mx-[3px] h-[14px] w-px bg-[color:var(--line)]" aria-hidden />
      <span className="truncate text-[12px] text-dim2">
        {windowSubtitle(props.t, props.snapshot, props.kind)}
      </span>
    </div>
  );
}
