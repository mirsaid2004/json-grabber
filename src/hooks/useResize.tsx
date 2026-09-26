import { useState } from 'react'

type useResizeProps = {
    initialWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    initialHeight?: number;
    minHeight?: number;
    maxHeight?: number;
}

function useResize(props: useResizeProps) {
  const [size, setSize] = useState({ width: props?.initialWidth || 0, height: props?.initialHeight || 0 });

  const minWidth = props?.minWidth || 250;
  const maxWidth = props?.maxWidth || window.innerWidth - 250; 
  const minHeight = props?.minHeight || 250;
  const maxHeight = props?.maxHeight || window.innerHeight - 250;

  function startResize(event: React.PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    function move(e: PointerEvent): void {
      const nextWidth = startWidth + (startX - e.clientX);
      const nextHeight = startHeight + (startY - e.clientY);
      setSize({ ...size, width: Math.max(minWidth, Math.min(nextWidth, maxWidth)), height: Math.max(minHeight, Math.min(nextHeight, maxHeight)) });
    }
    function up(): void {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return {
    size,
    setSize,
    startResize,
  }

}

export default useResize