import { useMemo, useRef, useState } from 'react';
import { captureStore } from '../capture/store';
import type { CaptureMeta } from '../capture/types';
import { compose, type ComposeItem, type ComposeMode } from '../engine/compose';
import { safeParse } from '../engine/json';
import { shortUrl } from '../engine/url';
import { download } from './download';
import { getDragIds, hasDragIds } from './dnd';
import { logStore } from './logStore';

const PREVIEW_LIMIT = 200_000;

interface ComposerProps {
  captures: CaptureMeta[];
  items: ComposeItem[];
  mode: ComposeMode;
  width: number;
  onModeChange(mode: ComposeMode): void;
  onAdd(ids: string[]): void;
  onRemove(id: string): void;
  onKeyChange(id: string, key: string): void;
  onClearItems(): void;
  onClose(): void;
  onResize(width: number): void;
}

export function Composer(props: ComposerProps) {
  const { captures, items, mode, width } = props;
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const meta = captures.find((c) => c.id === item.id);
        const body = captureStore.getBody(item.id);
        return { item, meta, parses: safeParse(body).ok };
      }),
    [items, captures]
  );

  const output = useMemo(() => {
    const sources = items.map((item) => ({ key: item.key, body: captureStore.getBody(item.id) }));
    try {
      return JSON.stringify(compose(sources, mode), null, 2);
    } catch (e) {
      return '// could not build preview: ' + (e instanceof Error ? e.message : String(e));
    }
  }, [items, mode, captures]);

  const truncated = output.length > PREVIEW_LIMIT;

  function onDrop(event: React.DragEvent): void {
    event.preventDefault();
    dragDepth.current = 0;
    setOver(false);
    const ids = getDragIds(event.dataTransfer);
    if (ids.length) props.onAdd(ids);
  }

  function exportComposition(): void {
    if (!items.length) return;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      download('composed-' + stamp + '.json', output);
      logStore.add('exported composition of ' + items.length + ' capture(s)');
    } catch (e) {
      logStore.add('export failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function copyComposition(): void {
    navigator.clipboard.writeText(output).then(
      () => logStore.add('composition copied to clipboard'),
      (e: unknown) => logStore.add('copy failed: ' + (e instanceof Error ? e.message : String(e)))
    );
  }

  // Drag-to-resize from the panel's left edge.
  function startResize(event: React.PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function move(e: PointerEvent): void {
      const next = startWidth + (startX - e.clientX);
      props.onResize(Math.max(260, Math.min(next, window.innerWidth - 200)));
    }
    function up(): void {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <aside className="composer" style={{ width: width + 'px' }}>
      <div className="resize-handle" onPointerDown={startResize} title="Drag to resize" />

      <div className="composer-head">
        <strong className="composer-title">Composer</strong>
        <span className="spacer" />
        <div className="segmented" role="group" aria-label="Wrap as">
          <button
            type="button"
            className={mode === 'object' ? 'active' : ''}
            title="Wrap captures in an object, keyed by name"
            onClick={() => props.onModeChange('object')}
          >
            {'{ }'} <span className="seg-label">Object</span>
          </button>
          <button
            type="button"
            className={mode === 'array' ? 'active' : ''}
            title="Wrap captures in an array, in list order"
            onClick={() => props.onModeChange('array')}
          >
            {'[ ]'} <span className="seg-label">Array</span>
          </button>
        </div>
        <button type="button" className="icon" title="Close composer" onClick={props.onClose}>
          ×
        </button>
      </div>

      <div
        className={'dropzone' + (over ? ' over' : '')}
        onDragEnter={(e) => {
          if (!hasDragIds(e.dataTransfer)) return;
          dragDepth.current += 1;
          setOver(true);
        }}
        onDragOver={(e) => {
          if (!hasDragIds(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setOver(false);
        }}
        onDrop={onDrop}
      >
        {rows.length === 0 ? (
          <p className="empty">Drag rows from the capture list here.</p>
        ) : (
          <ol className="compose-items">
            {rows.map(({ item, meta, parses }, index) => (
              <li key={item.id}>
                {mode === 'object' ? (
                  <input
                    className="key"
                    value={item.key}
                    spellCheck={false}
                    title="Key in the composed object"
                    onChange={(e) => props.onKeyChange(item.id, e.target.value)}
                  />
                ) : (
                  <span className="index">{index}</span>
                )}
                <span className="src" title={meta ? meta.url : item.id}>
                  {meta ? shortUrl(meta.url) : '(capture cleared)'}
                </span>
                {!parses && (
                  <span className="warn" title="Body is not valid JSON — included as raw text">
                    raw
                  </span>
                )}
                <button
                  type="button"
                  className="icon"
                  title="Remove from composition"
                  onClick={() => props.onRemove(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="composer-preview">
        <div className="log-header">
          Preview{truncated ? ' (truncated for display; export writes the whole document)' : ''}
        </div>
        <pre>{truncated ? output.slice(0, PREVIEW_LIMIT) + '\n…' : output}</pre>
      </div>

      <div className="composer-foot">
        <button type="button" onClick={props.onClearItems} disabled={!items.length}>
          Clear
        </button>
        <span className="spacer" />
        <button type="button" onClick={copyComposition} disabled={!items.length}>
          Copy
        </button>
        <button type="button" onClick={exportComposition} disabled={!items.length}>
          Export
        </button>
      </div>
    </aside>
  );
}
