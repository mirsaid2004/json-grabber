import { byteLength } from '../engine/bytes';
import { shortUrl } from '../engine/url';
import { logStore } from './logStore';
import type { Capture, CaptureMeta } from '../capture/types';

/**
 * In-memory capture store. Framework-free on purpose: this is the layer that
 * must not break when the UI changes.
 *
 * Bodies live in a Map, out of React state — only the (small) meta array is
 * snapshotted for rendering, so a few thousand captures stay cheap to render.
 *
 * Built by a factory so every test gets an isolated instance; the panel uses
 * the single `captureStore` exported at the bottom. Methods are closures over
 * local state, never `this`, so they can be passed around unbound.
 */

// esbuild replaces this at build time; Node (tests) provides it at runtime.
declare const process: { env: { NODE_ENV?: string } };

export const DEFAULT_CAPTURE_LIMIT = 5000;

export interface CaptureStoreOptions {
  /** Oldest captures are dropped past this many. */
  limit?: number;
  /** Called once per capture dropped by the limit, so the drop can be logged. */
  onEvict?(meta: CaptureMeta): void;
}

export function createCaptureStore(options: CaptureStoreOptions = {}) {
  const limit = options.limit ?? DEFAULT_CAPTURE_LIMIT;

  const bodies = new Map<string, string>();
  // Second lookup path to the same objects in `items` — not a copy.
  const index = new Map<string, CaptureMeta>();
  const listeners = new Set<() => void>();

  let items: CaptureMeta[] = [];
  let snapshot: readonly CaptureMeta[] = Object.freeze([]);
  let dirty = false;
  // Changes whenever any data does, bodies included. Memos that read bodies
  // depend on this rather than on the meta array.
  let version = 0;

  // Two counters with different lifetimes: `seq` numbers export files and
  // restarts at 001 on clear; `nextId` is identity and is never reset, so a
  // cleared capture's id can never be handed to a new one.
  let seq = 0;
  let nextId = 0;

  // Captures arriving in the same tick are coalesced into one notification.
  let scheduled = false;
  function emit(): void {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const listener of [...listeners]) listener();
    });
  }

  function changed(): void {
    version += 1;
    dirty = true;
    emit();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /** Stable reference between mutations — required by useSyncExternalStore. */
  function getSnapshot(): readonly CaptureMeta[] {
    if (dirty) {
      snapshot = items.slice();
      // Freezing turns an accidental in-place sort/reverse/push by a consumer
      // into an immediate TypeError instead of a silent missed re-render.
      if (process.env.NODE_ENV !== 'production') Object.freeze(snapshot);
      dirty = false;
    }
    return snapshot;
  }

  function getVersion(): number {
    return version;
  }

  function add(capture: Capture): void {
    seq += 1;
    nextId += 1;
    const entry: CaptureMeta = {
      id: 'c' + nextId,
      seq,
      url: capture.url,
      status: capture.status,
      mimeType: capture.mimeType,
      size: byteLength(capture.body),
      timestamp: capture.timestamp
    };
    items.push(entry);
    index.set(entry.id, entry);
    bodies.set(entry.id, capture.body);

    while (items.length > limit) {
      const dropped = items.shift()!;
      bodies.delete(dropped.id); // the line that actually frees the memory
      index.delete(dropped.id);
      options.onEvict?.(dropped);
    }
    changed();
  }

  function getBody(id: string): string {
    return bodies.get(id) ?? '';
  }

  function getMeta(id: string): CaptureMeta | null {
    return index.get(id) ?? null;
  }

  /**
   * Rebuilds the on-disk shape for one capture. Note it returns exactly the
   * five Capture fields — `id`, `seq` and `size` are internal and never exported.
   */
  function toCapture(id: string): Capture | null {
    const entry = index.get(id);
    if (!entry) return null;
    return {
      url: entry.url,
      status: entry.status,
      mimeType: entry.mimeType,
      body: getBody(id),
      timestamp: entry.timestamp
    };
  }

  function clear(): void {
    items = [];
    index.clear();
    bodies.clear();
    seq = 0; // filenames restart at 001; nextId deliberately untouched
    changed();
  }

  return { subscribe, getSnapshot, getVersion, add, getBody, getMeta, toCapture, clear };
}

export type CaptureStore = ReturnType<typeof createCaptureStore>;

/** The panel's single shared instance. */
export const captureStore = createCaptureStore({
  onEvict: (meta) =>
    logStore.add('dropped oldest capture ' + shortUrl(meta.url) + ' (limit ' + DEFAULT_CAPTURE_LIMIT + ')')
});
