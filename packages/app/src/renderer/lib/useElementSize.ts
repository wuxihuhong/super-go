import { useEffect, useState } from 'react';

/**
 * 容器尺寸监听（棋盘自适应 + devicePixelRatio 同步用）。
 * 回调 ref 形式：宿主组件可能先渲染 null（如 i18n 门控）再挂载，
 * 观察器须在元素真正出现时才 attach。
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: (element: T | null) => void;
  width: number;
  height: number;
} {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect !== undefined) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref: setElement, width: size.width, height: size.height };
}
