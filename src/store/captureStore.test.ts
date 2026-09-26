import type { CaptureMeta } from '../capture/types';
import { createCaptureStore } from './captureStore';

const sample = (url: string, body = '{"ok":true}') => ({
  url,
  status: 200,
  mimeType: 'application/json',
  body,
  timestamp: '2026-09-26T00:00:00.000Z'
});

/** Listeners are notified on a microtask; this lets one flush. */
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('snapshot', () => {
  test('reflects added captures', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a'));
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0].url).toBe('https://x.dev/a');
  });

  test('is stable between mutations', () => {
    const store = createCaptureStore();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.add(sample('https://x.dev/a'));
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test('changes reference after a mutation', () => {
    const store = createCaptureStore();
    const empty = store.getSnapshot();
    store.add(sample('https://x.dev/a'));
    const one = store.getSnapshot();
    expect(one).not.toBe(empty);
    store.clear();
    expect(store.getSnapshot()).not.toBe(one);
  });

  test('an old snapshot is not changed by later mutations', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a'));
    const before = store.getSnapshot();
    store.add(sample('https://x.dev/b'));
    expect(before).toHaveLength(1);
  });

  test('is frozen, so in-place sorts fail loudly', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a'));
    store.add(sample('https://x.dev/b'));
    const snapshot = store.getSnapshot() as CaptureMeta[];
    expect(() => snapshot.sort((a, b) => b.seq - a.seq)).toThrow(TypeError);
    expect(() => snapshot.push(snapshot[0])).toThrow(TypeError);
  });
});

describe('ids and seq', () => {
  test('ids are never reused after clear', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/users'));
    const firstId = store.getSnapshot()[0].id;
    store.clear();
    store.add(sample('https://x.dev/billing'));
    expect(store.getSnapshot()[0].id).not.toBe(firstId);
    expect(store.getBody(firstId)).toBe('');
    expect(store.getMeta(firstId)).toBeNull();
  });

  test('seq restarts at 1 after clear, for file numbering', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a'));
    store.add(sample('https://x.dev/b'));
    store.clear();
    store.add(sample('https://x.dev/c'));
    expect(store.getSnapshot()[0].seq).toBe(1);
  });
});

describe('lookups', () => {
  test('getMeta and getBody look up by id', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a', '{"a":1}'));
    store.add(sample('https://x.dev/b', '{"b":2}'));
    const [, second] = store.getSnapshot();
    expect(store.getMeta(second.id)).toBe(second);
    expect(store.getBody(second.id)).toBe('{"b":2}');
    expect(store.getMeta('nope')).toBeNull();
    expect(store.getBody('nope')).toBe('');
  });

  test('toCapture returns exactly the five export fields', () => {
    const store = createCaptureStore();
    const input = sample('https://x.dev/a', '{"a":1}');
    store.add(input);
    const { id } = store.getSnapshot()[0];
    expect(store.toCapture(id)).toStrictEqual(input);
    expect(store.toCapture('nope')).toBeNull();
  });

  test('methods work unbound (no reliance on this)', () => {
    const { add, getSnapshot, toCapture } = createCaptureStore();
    add(sample('https://x.dev/a'));
    const [entry] = getSnapshot();
    expect(toCapture(entry.id)?.url).toBe('https://x.dev/a');
  });

  test('size is the UTF-8 byte length of the body', () => {
    const store = createCaptureStore();
    store.add(sample('https://x.dev/a', '{"name":"日本"}'));
    expect(store.getSnapshot()[0].size).toBe(new TextEncoder().encode('{"name":"日本"}').length);
  });
});

describe('version', () => {
  test('bumps on every data change and is stable otherwise', () => {
    const store = createCaptureStore();
    const v0 = store.getVersion();
    store.add(sample('https://x.dev/a'));
    const v1 = store.getVersion();
    expect(v1).toBeGreaterThan(v0);
    store.clear();
    expect(store.getVersion()).toBeGreaterThan(v1);
    expect(store.getVersion()).toBe(store.getVersion());
  });
});

describe('limit', () => {
  test('drops the oldest captures, their bodies, and reports each drop', () => {
    const onEvict = jest.fn();
    const store = createCaptureStore({ limit: 2, onEvict });
    store.add(sample('https://x.dev/1'));
    const firstId = store.getSnapshot()[0].id;
    store.add(sample('https://x.dev/2'));
    store.add(sample('https://x.dev/3'));
    expect(store.getSnapshot().map((m) => m.url)).toEqual(['https://x.dev/2', 'https://x.dev/3']);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://x.dev/1' }));
    expect(store.getBody(firstId)).toBe('');
    expect(store.getMeta(firstId)).toBeNull();
  });
});

describe('subscribe', () => {
  test('several adds in one tick produce a single notification', async () => {
    const store = createCaptureStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.add(sample('https://x.dev/a'));
    store.add(sample('https://x.dev/b'));
    store.add(sample('https://x.dev/c'));
    expect(listener).not.toHaveBeenCalled(); // deferred, not synchronous
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toHaveLength(3);
  });

  test('returns a working unsubscribe', async () => {
    const store = createCaptureStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.add(sample('https://x.dev/a'));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.add(sample('https://x.dev/b'));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

test('instances are isolated from each other', () => {
  const a = createCaptureStore();
  const b = createCaptureStore();
  a.add(sample('https://x.dev/a'));
  expect(b.getSnapshot()).toHaveLength(0);
});
