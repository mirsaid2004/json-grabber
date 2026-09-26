/**
 * Tiny append-only log for the panel's own footer. Same subscribe/getSnapshot
 * shape as the capture store, and built the same way: a factory for isolated
 * tests, plus one shared instance for the panel.
 */

// esbuild replaces this at build time; Node (tests) provides it at runtime.
declare const process: { env: { NODE_ENV?: string } };

export const DEFAULT_LOG_LIMIT = 500;

export interface LogStoreOptions {
  /** Timestamp prefix for each line; injectable so tests are deterministic. */
  stamp?(): string;
  /** Oldest lines are dropped past this many, so a chatty session can't grow it forever. */
  limit?: number;
}

export function createLogStore(options: LogStoreOptions = {}) {
  const stamp = options.stamp ?? (() => new Date().toLocaleTimeString());
  const limit = options.limit ?? DEFAULT_LOG_LIMIT;
  const listeners = new Set<() => void>();

  let lines: string[] = [];
  let snapshot: readonly string[] = Object.freeze([]);
  let dirty = false;

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /** Stable reference between mutations — required by useSyncExternalStore. */
  function getSnapshot(): readonly string[] {
    if (dirty) {
      snapshot = lines.slice();
      if (process.env.NODE_ENV !== 'production') Object.freeze(snapshot);
      dirty = false;
    }
    return snapshot;
  }

  function add(message: string): void {
    lines.push(stamp() + '  ' + message);
    if (lines.length > limit) lines.splice(0, lines.length - limit);
    dirty = true;
    for (const listener of [...listeners]) listener();
  }

  return { subscribe, getSnapshot, add };
}

export type LogStore = ReturnType<typeof createLogStore>;

/** The panel's single shared instance. */
export const logStore = createLogStore();
