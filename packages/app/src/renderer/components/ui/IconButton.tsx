import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function IconButton(props: {
  label: string;
  hint?: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
  ok?: boolean;
  toggle?: boolean;
  size?: 'chrome' | 'dock';
  tooltipSide?: 'down' | 'up';
}): React.JSX.Element {
  const dock = props.size === 'dock';
  const tone = props.danger
    ? 'text-[color:var(--danger-txt)] hover:bg-[color:var(--danger-bg)]'
    : props.ok
      ? 'bg-[color:var(--acc-bg)] text-[color:var(--ok-txt)] hover:bg-[color:var(--acc-bg)]'
      : props.accent
        ? 'bg-[color:var(--acc-bg)] text-acc hover:bg-[color:var(--acc-bg)]'
        : 'text-dim hover:bg-[color:var(--acc-bg)] hover:text-acc';
  return (
    <Tooltip
      label={props.label}
      hint={props.hint}
      shortcut={props.shortcut}
      side={props.tooltipSide}
    >
      <button
        type="button"
        style={NO_DRAG}
        aria-label={props.label}
        aria-pressed={props.toggle === true ? props.accent === true : undefined}
        disabled={props.disabled}
        onClick={props.onClick}
        className={`flex items-center justify-center transition-[background,color,transform] duration-[120ms] ease-out active:scale-95 disabled:opacity-40 disabled:hover:bg-transparent ${
          dock ? 'h-9 w-9 rounded-[11px]' : 'h-[30px] w-[30px] rounded-lg'
        } ${tone}`}
      >
        {props.icon}
      </button>
    </Tooltip>
  );
}
