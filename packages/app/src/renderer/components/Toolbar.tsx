import { useState } from 'react';
import type { EngineSide } from '@super-go/core';
import type { AppSettings, EngineStatusPayload } from '@shared/ipc';
import type { MessageKey, TFunction } from '../i18n';
import SettingsPanel from './SettingsPanel';
import SetupPanel from './SetupPanel';
import { IconFlag, IconGear, IconPanel, IconPlus, IconUndo } from './icons';

export interface ToolbarProps {
  t: TFunction;
  playing: boolean;
  canUndo: boolean;
  /** 互搏观战不可认输 */
  canResign: boolean;
  panelOpen: boolean;
  engineStatus: EngineStatusPayload | null;
  onNewGame: (engineSide: EngineSide) => void;
  onUndo: () => void;
  onResign: () => void;
  onTogglePanel: () => void;
  onSettingsChanged: (next: AppSettings) => void;
}

type Popover = 'none' | 'setup' | 'settings';

/** hiddenInset 标题栏下，header 整体可拖拽窗口；交互元素逐一豁免 */
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export default function Toolbar(props: ToolbarProps) {
  const [popover, setPopover] = useState<Popover>('none');
  const toggle = (which: Popover): void => setPopover((cur) => (cur === which ? 'none' : which));

  const iconButton = (
    key: MessageKey,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    accent = false,
  ): React.JSX.Element => (
    <button
      key={key}
      type="button"
      style={NO_DRAG}
      title={props.t(key)}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
        accent
          ? 'text-accent hover:bg-accent/10 disabled:hover:text-accent'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:hover:text-muted-foreground'
      }`}
    >
      {icon}
    </button>
  );

  const dotTone = (): string => {
    switch (props.engineStatus?.status) {
      case 'thinking':
        return 'animate-pulse bg-accent';
      case 'crashed':
      case 'not-found':
        return 'bg-danger';
      case 'launching':
        return 'animate-pulse bg-muted-foreground';
      default:
        return 'bg-muted-foreground/50';
    }
  };

  return (
    <header
      style={DRAG}
      className="relative z-10 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-3 pl-20"
    >
      <span className="mr-2 text-sm font-semibold select-none">{props.t('app.name')}</span>

      <div className="relative" style={NO_DRAG}>
        {iconButton('toolbar.newGame', <IconPlus />, () => toggle('setup'), false, true)}
        {popover === 'setup' && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPopover('none')} />
            <div className="absolute top-10 left-0 z-20">
              <SetupPanel
                t={props.t}
                mode="new"
                onStart={(side) => {
                  setPopover('none');
                  props.onNewGame(side);
                }}
                onCancel={() => setPopover('none')}
              />
            </div>
          </>
        )}
      </div>

      {iconButton('toolbar.undo', <IconUndo />, props.onUndo, !props.canUndo)}
      {iconButton('toolbar.resign', <IconFlag />, props.onResign, !props.canResign)}
      {iconButton('toolbar.togglePanel', <IconPanel />, props.onTogglePanel)}

      {/* 右侧：引擎状态 + 设置 */}
      <div className="ml-auto flex items-center gap-2" style={NO_DRAG}>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dotTone()}`} />
          <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">
            {props.engineStatus?.name ?? ''}
          </span>
        </span>
        <div className="relative">
          {iconButton('settings.title', <IconGear />, () => toggle('settings'))}
          {popover === 'settings' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPopover('none')} />
              <div className="absolute top-10 right-0 z-20">
                <SettingsPanel t={props.t} onSettingsChanged={props.onSettingsChanged} />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
