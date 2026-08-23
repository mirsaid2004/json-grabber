import { byteLength } from '../engine/bytes';
import type { Capture, CaptureMeta } from './types';

/**
 * In-memory capture store. Framework-free on purpose: this is the layer that
 * must not break when the UI changes.
 *
 * Bodies live in a Map, out of React state — only the (small) meta array is
 * snapshotted for rendering, so a few thousand captures stay cheap to render.
 */

const bodies = new Map<string, string>();
const listeners = new Set<() => void>();

let meta: CaptureMeta[] = [];
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export const captureStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Stable reference between mutations — required by useSyncExternalStore. */
  getSnapshot(): CaptureMeta[] {
    return meta;
  },

  add(capture: Capture): void {
    seq += 1;
    const id = 'c' + seq;
    bodies.set(id, capture.body);
    meta = [
      ...meta,
      {
        id,
        seq,
        url: capture.url,
        status: capture.status,
        mimeType: capture.mimeType,
        size: byteLength(capture.body),
        timestamp: capture.timestamp
      }
    ];
    emit();
  },

  getBody(id: string): string {
    return bodies.get(id) ?? '';
  },

  /**
   * Rebuilds the on-disk shape for one capture. Note it returns exactly the
   * five Capture fields — `id`, `seq` and `size` are internal and never exported.
   */
  toCapture(id: string): Capture | null {
    const entry = meta.find((m) => m.id === id);
    if (!entry) return null;
    return {
      url: entry.url,
      status: entry.status,
      mimeType: entry.mimeType,
      body: this.getBody(id),
      timestamp: entry.timestamp
    };
  },

  clear(): void {
    bodies.clear();
    meta = [];
    seq = 0;
    emit();
  }
};
