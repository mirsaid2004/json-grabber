import { useEffect, useRef, useSyncExternalStore } from 'react';
import { logStore } from '../store/logStore';
import useResize from '../hooks/useResize';

/** Within this many px of the end counts as "at the bottom". */
const STICK_THRESHOLD = 8;

export function LogView() {
  const lines = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot, logStore.getSnapshot);

  const { size:{height}, startResize } = useResize({ initialHeight: 72, minHeight: 72 });

  const log = useRef<HTMLPreElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    const el = log.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function onScroll(): void {
    const el = log.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
  }

  return (
    <footer>
      <div className='resize-handle resize-handle-row' onPointerDown={startResize} title="Drag to resize"></div>
      <div className="log-header">Panel log</div>
      <pre className="log" ref={log} onScroll={onScroll} style={{height: height + 'px'}}>
        {lines.join('\n')}
      </pre>
    </footer>
  );
}
