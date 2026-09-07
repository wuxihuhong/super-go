import type { ReactNode } from 'react';
import { formatToolbarShortcut } from '../../lib/shortcuts';

export function Tooltip(props: {
  label: string;
  hint?: string;
  shortcut?: string;
  /** 顶栏向下、dock 向上 */
  side?: 'down' | 'up';
  children: ReactNode;
}): React.JSX.Element {
  const shortcutText =
    props.shortcut === undefined ? undefined : formatToolbarShortcut(props.shortcut);
  const up = props.side === 'up';
  return (
    <span className="group relative">
      {props.children}
      <span
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-[400ms] ${
          up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        }`}
      >
        <span className="font-medium">
          {props.label}
          {shortcutText !== undefined && (
            <kbd className="ml-1.5 rounded border border-background/30 px-1 py-px font-sans">
              {shortcutText}
            </kbd>
          )}
        </span>
        {props.hint !== undefined && <span className="block text-background/70">{props.hint}</span>}
      </span>
    </span>
  );
}
