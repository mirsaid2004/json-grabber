import { useEffect, useRef, useState } from 'react';

/** A bound: a fixed number, or a function read when a drag starts (for bounds that depend on layout). */
type Bound = number | (() => number);

type useResizeProps = {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: Bound;
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: Bound;
};

const read = (bound: Bound | undefined, fallback: number): number =>
  bound === undefined ? fallback : typeof bound === 'function' ? bound() : bound;

/**
 * Drag-to-resize for a panel edge. Resizes only the axes it was configured
 * for: pass width options to resize width, height options to resize height.
 *
 * The handle is assumed to sit on the left edge (width) or top edge (height),
 * so dragging left or up grows the element.
 */
function useResize(props: useResizeProps) {
  const resizesWidth = props.initialWidth !== undefined;
  const resizesHeight = props.initialHeight !== undefined;

  const [size, setSize] = useState({ width: props.initialWidth ?? 0, height: props.initialHeight ?? 0 });

  // The active drag's cleanup, so an unmount mid-drag doesn't leave listeners
  // on window.
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  function startResize(event: React.PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const start = size; // this render's size — startResize is recreated each render

    // Bounds are read once per drag, so layout-dependent maxima (e.g. "the
    // parent's height minus room for its other content") are current. `??`,
    // not `||`: an explicit 0 is a real bound.
    const minWidth = props.minWidth ?? 0;
    const maxWidth = Math.max(minWidth, read(props.maxWidth, Infinity));
    const minHeight = props.minHeight ?? 0;
    const maxHeight = Math.max(minHeight, read(props.maxHeight, Infinity));
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    function move(e: PointerEvent): void {
      setSize({
        width: resizesWidth ? clamp(start.width + (startX - e.clientX), minWidth, maxWidth) : start.width,
        height: resizesHeight ? clamp(start.height + (startY - e.clientY), minHeight, maxHeight) : start.height
      });
    }

    // Keep the resize cursor and suppress text selection for the whole drag,
    // even when the pointer leaves the thin handle.
    const body = document.body.style;
    const previous = { cursor: body.cursor, userSelect: body.userSelect };
    body.cursor = resizesWidth ? 'col-resize' : 'row-resize';
    body.userSelect = 'none';

    function stop(): void {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      body.cursor = previous.cursor;
      body.userSelect = previous.userSelect;
      stopDrag.current = null;
    }

    stopDrag.current?.();
    stopDrag.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return {
    size,
    setSize,
    startResize
  };
}

export default useResize;
