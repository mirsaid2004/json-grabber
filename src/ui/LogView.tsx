import { useSyncExternalStore } from 'react';
import { logStore } from '../store/logStore';

export function LogView() {
  const lines = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot, logStore.getSnapshot);

  return (
    <footer>
      <div className="log-header">Panel log</div>
      <pre className="log" ref={(el) => el && (el.scrollTop = el.scrollHeight)}>
        {lines.join('\n')}
      </pre>
    </footer>
  );
}
