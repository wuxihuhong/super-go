import type { GameKind, GameSetup, Player } from '@super-go/core';
import type { AppSettings } from '@shared/ipc';
import type { MessageKey, TFunction } from '../i18n';
import SettingsPanel from './SettingsPanel';
import SetupPanel from './SetupPanel';
import { hintKeyOf, ScoreEstimatePanel, type Popover } from './Toolbar';
import { IconButton } from './ui/IconButton';
import { PopoverLayer } from './ui/PopoverLayer';
import { Tooltip } from './ui/Tooltip';
import {
  IconBestMove,
  IconFlag,
  IconGear,
  IconInfo,
  IconPause,
  IconPlay,
  IconPlus,
  IconUndo,
} from './icons';

export interface BoardDockProps {
  t: TFunction;
  kind: GameKind;
  playing: boolean;
  paused: boolean;
  canUndo: boolean;
  canResign: boolean;
  showBestMove: boolean;
  thinking: boolean;
  komi: number;
  boardSize: number;
  popover: Popover;
  onPopoverChange: (popover: Popover) => void;
  onNewGame: (humanSide: Player, goSetup?: GameSetup) => void;
  onUndo: () => void;
  onResign: () => void;
  onPauseToggle: () => void;
  onPass: () => void;
  onToggleBestMove: () => void;
  onOpenAbout: () => void;
  onSettingsChanged: (next: AppSettings) => void;
}

export default function BoardDock(props: BoardDockProps): React.JSX.Element {
  const close = (): void => props.onPopoverChange('none');
  const icon = (
    key: MessageKey,
    node: React.ReactNode,
    onClick: () => void,
    extra?: { disabled?: boolean; accent?: boolean; danger?: boolean; shortcut?: string; toggle?: boolean },
  ): React.JSX.Element => (
    <IconButton
      size="dock"
      tooltipSide="up"
      label={props.t(key)}
      hint={props.t(hintKeyOf(key))}
      shortcut={extra?.shortcut}
      icon={node}
      onClick={onClick}
      disabled={extra?.disabled}
      accent={extra?.accent}
      danger={extra?.danger}
      toggle={extra?.toggle}
    />
  );

  const resign = (
    <div className="relative">
      {icon(
        'toolbar.resign',
        <IconFlag className="h-[17px] w-[17px]" />,
        () => {
          if (!props.canResign) return;
          props.onPopoverChange('resignConfirm');
        },
        { disabled: !props.canResign, danger: true, shortcut: 'Shift+R' },
      )}
      <PopoverLayer
        open={props.popover === 'resignConfirm'}
        onClose={close}
        placement="above"
        align="right"
      >
        <div className="sg-popover w-72 rounded-xl p-3">
          <h2 className="mb-1 px-1 text-xs font-semibold">{props.t('toolbar.resign.confirm')}</h2>
          <p className="mb-3 px-1 text-xs leading-relaxed text-dim">
            {props.t('toolbar.resign.confirm.body')}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-1.5 text-xs text-dim hover:bg-[color:var(--acc-bg)]"
            >
              {props.t('setup.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                props.onResign();
              }}
              className="rounded-lg bg-[color:var(--danger-bg)] px-3.5 py-1.5 text-xs font-medium text-[color:var(--danger-txt)]"
            >
              {props.t('toolbar.resign.confirm.ok')}
            </button>
          </div>
        </div>
      </PopoverLayer>
    </div>
  );

  const settings = (
    <div className="relative">
      {icon(
        'settings.title',
        <IconGear className="h-[17px] w-[17px]" />,
        () => props.onPopoverChange(props.popover === 'settingsDock' ? 'none' : 'settingsDock'),
        { shortcut: ',', toggle: true, accent: props.popover === 'settingsDock' },
      )}
      <PopoverLayer
        open={props.popover === 'settingsDock'}
        onClose={close}
        placement="above"
        align="right"
      >
        <SettingsPanel
          t={props.t}
          kind={props.kind}
          onSettingsChanged={props.onSettingsChanged}
          onOpenAbout={props.onOpenAbout}
        />
      </PopoverLayer>
    </div>
  );

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto relative flex items-center gap-1 rounded-[14px] border border-[color:var(--line)] px-1.5 py-1.5 [background:var(--dock)] [box-shadow:var(--dock-shadow)] backdrop-blur-[22px]">
        <div className="relative">
          <Tooltip label={props.t('toolbar.newGame')} hint={props.t('toolbar.newGame.hint')} shortcut="N" side="up">
            <button
              type="button"
              onClick={() => props.onPopoverChange(props.popover === 'setup' ? 'none' : 'setup')}
              className="sg-btn-solid flex h-9 items-center gap-[7px] rounded-[11px] pr-3.5 pl-[11px] text-[12.5px] font-bold"
            >
              <IconPlus className="h-4 w-4" />
              {props.t('toolbar.newGame')}
            </button>
          </Tooltip>
          <PopoverLayer
            open={props.popover === 'setup'}
            onClose={close}
            placement="above"
            align="left"
          >
            <SetupPanel
              t={props.t}
              kind={props.kind}
              mode="new"
              onStart={(side, goSetup) => {
                close();
                props.onNewGame(side, goSetup);
              }}
              onCancel={close}
            />
          </PopoverLayer>
        </div>
        {icon('toolbar.undo', <IconUndo className="h-[17px] w-[17px]" />, props.onUndo, {
          disabled: !props.canUndo,
          shortcut: 'Z',
        })}
        {icon(
          props.paused ? 'toolbar.resume' : 'toolbar.pause',
          props.paused ? (
            <IconPlay className="h-[17px] w-[17px]" />
          ) : (
            <IconPause className="h-[17px] w-[17px]" />
          ),
          props.onPauseToggle,
          { disabled: !props.playing, shortcut: ' ' },
        )}
        {resign}

        {props.kind === 'go' ? (
          <>
            <span className="mx-1 h-[22px] w-px bg-[color:var(--line)]" aria-hidden />
            {icon(
              'toolbar.pass',
              <span className="font-mono text-[13px] font-bold">P</span>,
              props.onPass,
              { disabled: !props.playing, shortcut: 'P' },
            )}
            {icon(
              'toolbar.bestMove',
              <IconBestMove className="h-[17px] w-[17px]" />,
              props.onToggleBestMove,
              { accent: props.showBestMove, shortcut: 'M', toggle: true },
            )}
            <div className="relative">
              {icon(
                'toolbar.score',
                <span className="text-[15px] font-bold">目</span>,
                () => props.onPopoverChange(props.popover === 'score' ? 'none' : 'score'),
                { shortcut: 'E' },
              )}
              <PopoverLayer
                open={props.popover === 'score'}
                onClose={close}
                placement="above"
                align="center"
              >
                <ScoreEstimatePanel
                  t={props.t}
                  thinking={props.thinking}
                  komi={props.komi}
                  boardSize={props.boardSize}
                />
              </PopoverLayer>
            </div>
            <span className="mx-1 h-[22px] w-px bg-[color:var(--line)]" aria-hidden />
            {settings}
            {icon('toolbar.about', <IconInfo className="h-[17px] w-[17px]" />, props.onOpenAbout)}
          </>
        ) : (
          <>
            <span className="mx-1 h-[22px] w-px bg-[color:var(--line)]" aria-hidden />
            {settings}
            {icon('toolbar.about', <IconInfo className="h-[17px] w-[17px]" />, props.onOpenAbout)}
          </>
        )}
      </div>
    </div>
  );
}
