import { useEffect, useRef, useState } from 'react';

/** 容器尺寸监听（棋盘自适应 + devicePixelRatio 同步用） */
export function useElementSize<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  width: number;
  height: number;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect !== undefined) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width: size.width, height: size.height };
}
