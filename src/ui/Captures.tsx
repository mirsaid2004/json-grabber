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

  /** Dragging a selected row carries the whole selection; otherwise just that row. */
  function onDragStart(event: React.DragEvent, id: string): void {
    const ids = selected.has(id) ? captures.filter((m) => selected.has(m.id)).map((m) => m.id) : [id];
    setDragIds(event.dataTransfer, ids);
  }

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
          <span className="counter" title={captures.length + ' captured'}>
            {captures.length} captured
          </span>
        </div>
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
