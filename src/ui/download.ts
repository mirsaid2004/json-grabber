import { slugFromUrl } from '../engine/url';
import { captureStore } from '../store/captureStore';
import type { CaptureMeta } from '../capture/types';

/**
 * Downloads via anchor + Blob + URL.createObjectURL. chrome.downloads is not
 * exposed to DevTools panel pages, so this is the reliable route here — and it
 * keeps the extension free of any download permission.
 */
export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function captureFileName(meta: CaptureMeta): string {
  return String(meta.seq).padStart(3, '0') + '-' + slugFromUrl(meta.url) + '.json';
}

/** Downloads one capture as its own file. */
export function downloadCapture(meta: CaptureMeta): void {
  const capture = captureStore.toCapture(meta.id);
  if (!capture) return;
  download(captureFileName(meta), JSON.stringify(capture, null, 2));
}

/** Downloads several, staggered — Chrome drops rapid-fire programmatic clicks. */
export function downloadEach(items: readonly CaptureMeta[]): void {
  items.forEach((meta, position) => {
    setTimeout(() => downloadCapture(meta), position * 150);
  });
}

/** One file holding an array of every capture object. */
export function downloadBundle(items: readonly CaptureMeta[]): void {
  const captures = items
    .map((meta) => captureStore.toCapture(meta.id))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  download('json-grabber-' + stamp + '.json', JSON.stringify(captures, null, 2));
}
