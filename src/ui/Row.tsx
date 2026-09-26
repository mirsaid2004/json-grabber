import { useMemo, useState } from 'react';
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

export function Row({ meta, checked, onToggle, onDragStart }: RowProps) {
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

  return (
    <>
      <tr
        className={'row' + (open ? ' open' : '')}
        draggable
        onDragStart={(e) => onDragStart(e, meta.id)}
        onClick={() => setOpen(!open)}
      >
        <td className="cell-check">
          <input
            type="checkbox"
            checked={checked}
            title='Select for "Export selected"'
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(meta.id)}
          />
        </td>
        <td title={meta.url}>{shortUrl(meta.url)}</td>
        <td className={'cell-status' + (meta.status >= 400 ? ' status-err' : '')}>{meta.status}</td>
        <td className="cell-size">{formatSize(meta.size)}</td>
        <td className="cell-save">
          <button type="button" className="save" title="Download just this capture" onClick={save}>
            Save
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={5}>
            <div className="full-url">
              {meta.url} &middot; {meta.mimeType || 'unknown'} &middot; {meta.timestamp}
            </div>
            <JsonView value={body} />
          </td>
        </tr>
      )}
    </>
  );
}
