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
    /** 不用 fixed 遮罩：dock 有 translate，会把 fixed 困在胶囊里，点盘面关不掉 */
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) {
        props.onClose();
        return;
      }
      const root = panelRef.current?.parentElement;
      if (root?.contains(target)) return;
      if (
        props.toggle !== undefined &&
        target instanceof Element &&
        target.closest(`[data-popover-toggle="${props.toggle}"]`) !== null
      ) {
        return;
      }
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
