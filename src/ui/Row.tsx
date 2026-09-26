import { memo, useMemo, useState } from 'react';
import { captureStore } from '../store/captureStore';
import type { CaptureMeta } from '../capture/types';
import { formatSize } from '../engine/bytes';
import { prettyPrint } from '../engine/json';
import { shortUrl } from '../engine/url';
import { downloadCapture } from './download';
import { JsonView } from './editor/JsonView';
import { logStore } from '../store/logStore';

interface RowProps {
  meta: CaptureMeta;
  checked: boolean;
  onToggle(id: string): void;
  onDragStart(event: React.DragEvent, id: string): void;
}

/**
 * Memoised: a new capture must not re-render every existing row. Props are
 * cheap to compare — `meta` objects are immutable per id, and the callbacks
 * come in stable (`useCallback`) from Captures and Panel.
 */
export const Row = memo(function Row({ meta, checked, onToggle, onDragStart }: RowProps) {
  const [open, setOpen] = useState(false);

  // Body is pulled from the store only once the row is expanded, so large
  // bodies never sit in React state. Memoised: bodies are write-once, so the
  // id alone decides the text, and other captures arriving must not re-format it.
  const body = useMemo(() => (open ? prettyPrint(captureStore.getBody(meta.id)) : ''), [open, meta.id]);

  function save(event: React.MouseEvent): void {
    event.stopPropagation(); // don't toggle expand/collapse
    try {
      downloadCapture(meta);
      logStore.add('saved ' + shortUrl(meta.url));
    } catch (e) {
      logStore.add('save failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // The row's five cells. Rendered as <td>s for a closed row, and as <div>s in
  // the pinned bar of an open row (see below) — same content, same classes.
  function cells(Cell: 'td' | 'div') {
    return (
      <>
        <Cell className="cell-check">
          <input
            type="checkbox"
            checked={checked}
            title='Select for "Export selected"'
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(meta.id)}
          />
        </Cell>
        <Cell className="cell-url" title={meta.url}>
          {shortUrl(meta.url)}
        </Cell>
        <Cell className={'cell-status' + (meta.status >= 400 ? ' status-err' : '')}>{meta.status}</Cell>
        <Cell className="cell-size">{formatSize(meta.size)}</Cell>
        <Cell className="cell-save">
          <button type="button" className="save" title="Download just this capture" onClick={save}>
            Save
          </button>
        </Cell>
      </>
    );
  }

  const rowEvents = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => onDragStart(e, meta.id),
    onClick: () => setOpen(!open)
  };

  if (!open) {
    return (
      <tr className="row" {...rowEvents}>
        {cells('td')}
      </tr>
    );
  }

  // Open: one full-width cell holding a copy of the row as a flex bar, then the
  // body. Chrome bounds a sticky <tr> or <td> by the whole table, so a pinned
  // table row would stay stuck over unrelated rows; an element inside this cell
  // is bounded by the cell, so the bar pins while its body scrolls and leaves
  // with it. Column widths are shared CSS variables, so the bar lines up.
  return (
    <tr className="detail">
      <td colSpan={5}>
        <div className="detail-sticky">
          <div className="row row-bar open" {...rowEvents}>
            {cells('div')}
          </div>
          <div className="full-url">
            {meta.url} &middot; {meta.mimeType || 'unknown'} &middot; {meta.timestamp}
          </div>
        </div>
        <JsonView value={body} />
      </td>
    </tr>
  );
});
