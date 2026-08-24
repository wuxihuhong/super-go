import { useState } from 'react';
import type { Player } from '@super-go/core';
import type { MessageKey } from '../i18n';
import SetupPanel from './SetupPanel';
import { IconFlag, IconPanel, IconPlus, IconUndo } from './icons';

export interface ToolbarProps {
  t: (key: MessageKey) => string;
  playing: boolean;
  canUndo: boolean;
  panelOpen: boolean;
  onNewGame: (engineSide: Player, elo: number | null) => void;
  onUndo: () => void;
  onResign: () => void;
  onTogglePanel: () => void;
}

export default function Toolbar(props: ToolbarProps) {
  const [setupOpen, setSetupOpen] = useState(false);

  const iconButton = (
    key: MessageKey,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
  ): React.JSX.Element => (
    <button
      key={key}
      type="button"
      title={props.t(key)}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {icon}
    </button>
  );

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-3">
      <span className="mr-2 text-sm font-semibold select-none">{props.t('app.name')}</span>

      <div className="relative">
        {iconButton('toolbar.newGame', <IconPlus />, () => setSetupOpen((v) => !v))}
        {setupOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSetupOpen(false)} />
            <div className="absolute top-10 left-0 z-20">
              <SetupPanel
                t={props.t}
                mode="new"
                onStart={(side, elo) => {
                  setSetupOpen(false);
                  props.onNewGame(side, elo);
                }}
                onCancel={() => setSetupOpen(false)}
              />
            </div>
          </>
        )}
      </div>

      {iconButton('toolbar.undo', <IconUndo />, props.onUndo, !props.canUndo)}
      {iconButton('toolbar.resign', <IconFlag />, props.onResign, !props.playing)}
      {iconButton('toolbar.togglePanel', <IconPanel />, props.onTogglePanel)}
    </header>
  );
}
