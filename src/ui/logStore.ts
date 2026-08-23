/** Tiny append-only log for the panel's own footer. Same subscribe shape as captureStore. */

const listeners = new Set<() => void>();
let lines: string[] = [];

export const logStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): string[] {
    return lines;
  },

  add(message: string): void {
    const stamp = new Date().toLocaleTimeString();
    lines = [...lines, stamp + '  ' + message];
    for (const listener of listeners) listener();
  }
};
