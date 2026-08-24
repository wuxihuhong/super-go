import { evalLabel, evalProportion } from '../lib/eval';
import type { TFunction } from '../i18n';

export interface WinBarProps {
  t: TFunction;
  /** 红方视角厘兵（+ = 红优） */
  redCp?: number;
  /** 红方视角杀棋步数 */
  redMate?: number;
}

/**
 * 局势条（§7.4：细窄贴边，不抢焦点）。
 * 红黑双色：红占下半（与棋盘红下方位一致），红色占比 = 红方局势；
 * 底部一行自然语言标签，引擎数字不出现在界面上。
 * 红/黑/均势等属棋类领域数据，单字标识随棋子汉字口径，不随 UI 语言切换。
 */
export default function WinBar(props: WinBarProps) {
  const proportion = evalProportion(props.redCp, props.redMate);
  const label = evalLabel(props.t, props.redCp, props.redMate);
  return (
    <div className="flex h-full flex-col items-center gap-1 py-1" title={label}>
      <span className="text-[10px] leading-none text-piece-black select-none">黑</span>
      <div className="relative w-2.5 flex-1 overflow-hidden rounded-full bg-piece-black/85">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-piece-red transition-[height] duration-500 ease-out"
          style={{ height: `${proportion * 100}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px bg-background/70" />
      </div>
      <span className="text-[10px] leading-none text-piece-red select-none">红</span>
      <span className="max-w-12 text-center text-[11px] leading-tight text-muted-foreground select-none">
        {label}
      </span>
    </div>
  );
}
