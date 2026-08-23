/** Native HTML5 drag and drop between the capture table and the composer. */

export const DND_MIME = 'application/x-json-grabber-ids';

export function setDragIds(dt: DataTransfer, ids: string[]): void {
  dt.setData(DND_MIME, ids.join(','));
  dt.effectAllowed = 'copy';
}

export function getDragIds(dt: DataTransfer): string[] {
  const raw = dt.getData(DND_MIME);
  return raw ? raw.split(',').filter(Boolean) : [];
}

/** During dragover the payload is unreadable for security — only types are. */
export function hasDragIds(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes(DND_MIME);
}
