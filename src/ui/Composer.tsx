import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { captureStore } from '../store/captureStore';
import { formatSize } from '../engine/bytes';
import { compose, type ComposeItem, type ComposeMode } from '../engine/compose';
import { safeParse } from '../engine/json';
import { shortUrl } from '../engine/url';
import { download } from './download';
import { getDragIds, hasDragIds } from './dnd';
import { JsonView } from './editor/JsonView';
import { logStore } from '../store/logStore';
import useResize from '../hooks/useResize';

/**
 * The viewer renders only visible lines, so output length is not a problem —
 * but building the output is a full JSON.parse + stringify of every body. Past
 * this much input the preview is skipped, and Export / Copy build it on demand.
 */
const PREVIEW_MAX_INPUT = 20 * 1024 * 1024;

/** The composed document as text. Throws if it cannot be built. */
function buildOutput(items: ComposeItem[], mode: ComposeMode): string {
  const sources = items.map((item) => ({ key: item.key, body: captureStore.getBody(item.id) }));
  return JSON.stringify(compose(sources, mode), null, 2);
}

type Preview = { kind: 'text'; text: string } | { kind: 'suppressed'; bytes: number } | { kind: 'error'; message: string };

interface ComposerProps {
  items: ComposeItem[];
  mode: ComposeMode;
  onModeChange(mode: ComposeMode): void;
  onAdd(ids: string[]): void;
  onRemove(id: string): void;
  onKeyChange(id: string, key: string): void;
  onClearItems(): void;
  onClose(): void;
}

const INITIAL_WIDTH = 420;
/** Preview + footer block. The footer alone is ~40px, so this leaves room for the editor. */
const INITIAL_PREVIEW_HEIGHT = 220;
const MIN_PREVIEW_HEIGHT = 110;
/** Kept for the composer head and drop zone when the preview is dragged taller. */
const RESERVED_ABOVE_PREVIEW = 110;

export function Composer(props: ComposerProps) {
  const { items, mode } = props;

  const version = useSyncExternalStore(
    captureStore.subscribe,
    captureStore.getVersion,
    captureStore.getVersion
  );

  const aside = useRef<HTMLElement>(null);
  const { size: { width }, startResize: startResizeColumn } = useResize({
    initialWidth: INITIAL_WIDTH,
    minWidth: 260,
    maxWidth: () => window.innerWidth - 200
  });
  const { size: { height }, startResize: startResizeRow } = useResize({
    initialHeight: INITIAL_PREVIEW_HEIGHT,
    minHeight: MIN_PREVIEW_HEIGHT,
    // Relative to the composer, not the window: inside DevTools the window is
    // only as tall as the panel.
    maxHeight: () => (aside.current?.clientHeight ?? 0) - RESERVED_ABOVE_PREVIEW
  });

  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const meta = captureStore.getMeta(item.id);
        const body = captureStore.getBody(item.id);
        return { item, meta, parses: safeParse(body).ok };
      }),
    [items, version]
  );

  const inputBytes = rows.reduce((sum, row) => sum + (row.meta ? row.meta.size : 0), 0);

  const preview = useMemo((): Preview => {
    if (inputBytes > PREVIEW_MAX_INPUT) return { kind: 'suppressed', bytes: inputBytes };
    try {
      return { kind: 'text', text: buildOutput(items, mode) };
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }, [items, mode, version, inputBytes]);

  /** The full document for Export / Copy: the preview's text when it has one. */
  function fullOutput(): string {
    return preview.kind === 'text' ? preview.text : buildOutput(items, mode);
  }

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
      download('composed-' + stamp + '.json', fullOutput());
      logStore.add('exported composition of ' + items.length + ' capture(s)');
    } catch (e) {
      logStore.add('export failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function copyComposition(): void {
    let text: string;
    try {
      text = fullOutput();
    } catch (e) {
      logStore.add('copy failed: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => logStore.add('composition copied to clipboard'),
      (e: unknown) => logStore.add('copy failed: ' + (e instanceof Error ? e.message : String(e)))
    );
  }

  return (
    <aside className="composer" ref={aside} style={{ width: width + 'px' }}>
      <div className="resize-handle resize-handle-col" onPointerDown={startResizeColumn} title="Drag to resize" />

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
      <div className="composer-wrapper" style={{ height: height + 'px' }}>
        <div className="resize-handle resize-handle-row" onPointerDown={startResizeRow} title="Drag to resize" />
        <div className="composer-preview">
          <div className="log-header">Preview</div>
          {preview.kind === 'text' && <JsonView value={preview.text} />}
          {preview.kind === 'suppressed' && (
            <p className="empty">
              Preview skipped: {formatSize(preview.bytes)} of input. Export and Copy still build the
              whole document.
            </p>
          )}
          {preview.kind === 'error' && <p className="empty">Could not build preview: {preview.message}</p>}
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
      </div>
    </aside>
  );
}
