import { evalProportion, evalValueText } from '../lib/eval';
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
 * 条下直接给引擎原始整数分（+ = 红优），杀棋阶段显示 N 步杀（红/黑由颜色区分）。
 * 红/黑单字标识属领域数据，随棋子汉字口径，不随 UI 语言切换。
 */
export default function WinBar(props: WinBarProps) {
  const proportion = evalProportion(props.redCp, props.redMate);
  const value = evalValueText(props.t, props.redCp, props.redMate);
  return (
    <div className="flex h-full flex-col items-center gap-1.5 py-1" title={value.text}>
      <span className="text-[11px] leading-none text-piece-black select-none">黑</span>
      <div className="relative w-3 flex-1 overflow-hidden rounded-full bg-piece-black/90 ring-1 ring-inset ring-black/10">
        <div
          className="absolute inset-x-0 bottom-0 bg-piece-red transition-[height] duration-500 ease-out"
          style={{ height: `${proportion * 100}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-background/80" />
      </div>
      <span className="text-[11px] leading-none text-piece-red select-none">红</span>
      <span
        className={`text-[11px] leading-none tabular-nums select-none ${
          value.side === 'red'
            ? 'text-piece-red'
            : value.side === 'black'
              ? 'text-piece-black'
              : 'text-muted-foreground'
        }`}
      >
        {value.text}
      </span>
    </div>
  );
}
