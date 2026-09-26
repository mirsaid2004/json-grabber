import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { attachNetworkListener } from '../capture/listener';
import { captureStore } from '../store/captureStore';
import { keyFromUrl, type ComposeItem, type ComposeMode } from '../engine/compose';
import { urlMatches } from '../engine/url';
import { Captures } from './Captures';
import { Composer } from './Composer';
import { LogView } from './LogView';
import { logStore } from '../store/logStore';

export function Panel() {
  // Third arg lets the tree render outside a browser (headless smoke tests);
  // the panel itself is client-only so it is never used at runtime.
  const captures = useSyncExternalStore(
    captureStore.subscribe,
    captureStore.getSnapshot,
    captureStore.getSnapshot
  );
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [composerOpen, setComposerOpen] = useState(false);
  const [composeItems, setComposeItems] = useState<ComposeItem[]>([]);
  const [composeMode, setComposeMode] = useState<ComposeMode>('object');
  const [composerWidth, setComposerWidth] = useState(420);

  // The listener lives outside React's render cycle, so it reads the filter
  // through a ref — edits apply to new requests without re-attaching.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    const detach = attachNetworkListener({
      shouldKeep(url, mimeType) {
        if ((mimeType || '').toLowerCase().includes('json')) return true;
        return urlMatches(url, filterRef.current);
      },
      onCapture: (capture) => captureStore.add(capture),
      onLog: (message) => logStore.add(message)
    });
    logStore.add('panel ready — capturing while DevTools is open on this tab');
    return detach;
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Adds captures to the composition, skipping ones already in it. */
  const addToComposition = useCallback((ids: string[]) => {
    setComposeItems((prev) => {
      const present = new Set(prev.map((item) => item.id));
      const additions = ids
        .filter((id) => !present.has(id))
        .map((id) => {
          const entry = captureStore.getMeta(id);
          return { id, key: entry ? keyFromUrl(entry.url) : 'response' };
        });
      if (!additions.length) return prev;
      return [...prev, ...additions];
    });
  }, []);

  const openComposer = useCallback(
    (ids: string[]) => {
      setComposerOpen(true);
      addToComposition(ids);
    },
    [addToComposition]
  );

  return (
    <>
      <div className="workspace">
        <div className="primary">
          <Captures
            captures={captures}
            filter={filter}
            onFilterChange={setFilter}
            selected={selected}
            onToggle={toggle}
            onClearSelection={clearSelection}
            onCompose={openComposer}
          />
        </div>

        {composerOpen && (
          <Composer
            items={composeItems}
            mode={composeMode}
            width={composerWidth}
            onModeChange={setComposeMode}
            onAdd={addToComposition}
            onRemove={(id) => setComposeItems((prev) => prev.filter((item) => item.id !== id))}
            onKeyChange={(id, key) =>
              setComposeItems((prev) =>
                prev.map((item) => (item.id === id ? { ...item, key } : item))
              )
            }
            onClearItems={() => setComposeItems([])}
            onClose={() => setComposerOpen(false)}
            onResize={setComposerWidth}
          />
        )}
      </div>

      <LogView />
    </>
  );
}
