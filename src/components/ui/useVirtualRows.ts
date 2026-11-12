// Windowed rendering for long tables (more than `threshold` rows on screen at once): only the rows
// in view (plus an overscan) are mounted; spacer rows keep the scroll height. Below the threshold
// every row renders as before. Rows must have a roughly fixed height (`rowHeight`, px).
import { useCallback, useState, type CSSProperties, type UIEvent } from 'react';

export const VIRTUAL_THRESHOLD = 200;

export function useVirtualRows(count: number, opts: { rowHeight: number; maxHeight?: number; overscan?: number; threshold?: number }) {
  const { rowHeight, maxHeight = 640, overscan = 10, threshold = VIRTUAL_THRESHOLD } = opts;
  const active = count > threshold;
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e: UIEvent<HTMLElement>) => setScrollTop(e.currentTarget.scrollTop), []);
  if (!active) return { active, start: 0, end: count, padTop: 0, padBottom: 0, containerProps: {} as { style?: CSSProperties; onScroll?: (e: UIEvent<HTMLElement>) => void } };
  const visible = Math.ceil(maxHeight / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, start + visible + overscan * 2);
  return {
    active, start, end,
    padTop: start * rowHeight,
    padBottom: (count - end) * rowHeight,
    containerProps: { style: { maxHeight, overflowY: 'auto' } as CSSProperties, onScroll },
  };
}
