import { useEffect, useRef, type ReactNode } from 'react';

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function PopoverLayer(props: {
  open: boolean;
  onClose: () => void;
  placement?: 'below' | 'above';
  align?: 'left' | 'right' | 'center';
  /** 与触发按钮上的 data-popover-toggle 对应；避免第二个入口的 pointerdown 先关再被 click 打开 */
  toggle?: string;
  children: ReactNode;
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    /** 不用 dock 内 fixed 遮罩：translate 会把遮罩困在胶囊里。capture 关层时必须吞掉事件，否则会点穿落子。 */
    const outside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return true;
      const root = panelRef.current?.parentElement;
      if (root?.contains(target)) return false;
      return !(
        props.toggle !== undefined &&
        target instanceof Element &&
        target.closest(`[data-popover-toggle="${props.toggle}"]`) !== null
      );
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (!outside(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      // 关层会同步重渲染并卸载本 effect，吞 click 的监听不能挂在 effect 生命周期里
      const swallow = (ev: MouseEvent): void => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      const release = (): void => {
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      document.addEventListener('pointerup', release, { capture: true, once: true });
      document.addEventListener('pointercancel', release, { capture: true, once: true });
      props.onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [props.open, props.onClose, props.toggle]);

  if (!props.open) return null;
  const above = props.placement === 'above';
  const align =
    props.align === 'right'
      ? 'right-0'
      : props.align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0';
  return (
    <div
      ref={panelRef}
      className={`absolute z-20 ${above ? 'bottom-full mb-2' : 'top-full mt-2'} ${align}`}
      style={NO_DRAG}
    >
      {props.children}
    </div>
  );
}
