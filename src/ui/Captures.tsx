import { useCallback, useEffect, useRef } from 'react';
import type { CaptureMeta } from '../capture/types';
import { captureStore } from '../store/captureStore';
import { downloadBundle, downloadEach } from './download';
import { ExportButton, type ExportFormat } from './ExportButton';
import { setDragIds } from './dnd';
import { logStore } from '../store/logStore';
import { Row } from './Row';

interface CapturesProps {
  captures: readonly CaptureMeta[];
  filter: string;
  onFilterChange(value: string): void;
  selected: Set<string>;
  onToggle(id: string): void;
  onClearSelection(): void;
  onCompose(ids: string[]): void;
}

export function Captures(props: CapturesProps) {
  const { captures, filter, onFilterChange, selected, onToggle, onClearSelection } = props;

  // One export button: it acts on the selection when there is one, else on everything.
  const target = selected.size ? captures.filter((meta) => selected.has(meta.id)) : captures;
  const exportLabel = selected.size ? 'Export selected (' + selected.size + ')' : 'Export all';

  function clear(): void {
    captureStore.clear();
    onClearSelection();
    logStore.add('cleared');
  }

  function exportTarget(format: ExportFormat): void {
    if (!target.length) {
      logStore.add('nothing to export');
      return;
    }
    try {
      if (format === 'separate') {
        downloadEach(target);
        logStore.add('exporting ' + target.length + ' capture(s) as separate files');
      } else {
        downloadBundle(target);
        logStore.add('exported ' + target.length + ' capture(s) as a single file');
      }
    } catch (e) {
      logStore.add('export failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Read by onDragStart at drag time. Updated in an effect (not during render,
  // which StrictMode and concurrent rendering can discard); a drag always
  // starts well after the commit that set it.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /**
   * Dragging a selected row carries the whole selection, in table order;
   * otherwise just that row. Never changes identity, so memoised rows re-render
   * only when their own props do: it reads the selection through a ref and the
   * list from the store, instead of closing over `selected` and `captures`.
   */
  const onDragStart = useCallback((event: React.DragEvent, id: string) => {
    const current = selectedRef.current;
    const ids = current.has(id)
      ? captureStore.getSnapshot().filter((m) => current.has(m.id)).map((m) => m.id)
      : [id];
    setDragIds(event.dataTransfer, ids);
  }, []);

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-filter">
          <input
            type="text"
            placeholder="URL filter (substring, case-insensitive)"
            spellCheck={false}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
          <button type="button" onClick={clear}>
            Clear
          </button>
        </div>

        <div className="toolbar-actions">
          {selected.size > 0 && (
            <button
              type="button"
              className="compose-btn"
              title="Open the composer with the selected captures"
              onClick={() => props.onCompose(Array.from(selected))}
            >
              Compose ({selected.size})
            </button>
          )}
          <ExportButton label={exportLabel} onExport={exportTarget} />
        </div>
      </div>
          <div className="counter" title={captures.length + ' captured'}>
            {captures.length} captured
          </div>

      <main>
        <table>
          <thead>
            <tr>
              <th className="col-check" />
              <th className="col-url">URL</th>
              <th className="col-status">Status</th>
              <th className="col-size">Size</th>
              <th className="col-save" />
            </tr>
          </thead>
          <tbody>
            {captures.map((meta) => (
              <Row
                key={meta.id}
                meta={meta}
                checked={selected.has(meta.id)}
                onToggle={onToggle}
                onDragStart={onDragStart}
              />
            ))}
          </tbody>
        </table>
        {captures.length === 0 && (
          <p className="empty">No captures yet. Browse the inspected tab with DevTools open.</p>
        )}
      </main>
    </>
  );
}
