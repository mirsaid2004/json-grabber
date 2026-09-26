import { useEffect, useRef, useSyncExternalStore } from 'react';
import { logStore } from '../store/logStore';

/** Within this many px of the end counts as "at the bottom". */
const STICK_THRESHOLD = 8;

export function LogView() {
  const lines = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot, logStore.getSnapshot);
  const log = useRef<HTMLPreElement>(null);
  // Follow new lines only while the user is already at the bottom, so scrolling
  // up to read an earlier line isn't yanked away by the next capture. Measured
  // on scroll, because by the time the effect runs the new line is already in.
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
      <div className="log-header">Panel log</div>
      <pre className="log" ref={log} onScroll={onScroll}>
        {lines.join('\n')}
      </pre>
    </footer>
  );
}
