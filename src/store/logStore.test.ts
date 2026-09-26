import { createLogStore, DEFAULT_LOG_LIMIT } from './logStore';

const fixedStamp = () => '12:00:00';

test('add appends a stamped line', () => {
  const store = createLogStore({ stamp: fixedStamp });
  store.add('hello');
  store.add('world');
  expect(store.getSnapshot()).toEqual(['12:00:00  hello', '12:00:00  world']);
});

test('getSnapshot is stable between mutations and changes after one', () => {
  const store = createLogStore({ stamp: fixedStamp });
  const empty = store.getSnapshot();
  expect(store.getSnapshot()).toBe(empty);
  store.add('x');
  const one = store.getSnapshot();
  expect(one).not.toBe(empty);
  expect(store.getSnapshot()).toBe(one);
  store.add('y');
  expect(one).toHaveLength(1); // old snapshot untouched
});

test('snapshot is frozen', () => {
  const store = createLogStore({ stamp: fixedStamp });
  store.add('x');
  expect(() => (store.getSnapshot() as string[]).push('y')).toThrow(TypeError);
});

test('subscribe notifies synchronously and unsubscribes', () => {
  const store = createLogStore({ stamp: fixedStamp });
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  store.add('a');
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.add('b');
  expect(listener).toHaveBeenCalledTimes(1);
});

describe('limit', () => {
  test('keeps only the newest lines past the limit', () => {
    const store = createLogStore({ stamp: fixedStamp, limit: 3 });
    for (const m of ['a', 'b', 'c', 'd', 'e']) store.add(m);
    expect(store.getSnapshot()).toEqual(['12:00:00  c', '12:00:00  d', '12:00:00  e']);
  });

  test('a snapshot taken before trimming is left intact', () => {
    const store = createLogStore({ stamp: fixedStamp, limit: 2 });
    store.add('a');
    store.add('b');
    const before = store.getSnapshot();
    store.add('c');
    expect(before).toEqual(['12:00:00  a', '12:00:00  b']);
    expect(store.getSnapshot()).toEqual(['12:00:00  b', '12:00:00  c']);
  });

  test('defaults to DEFAULT_LOG_LIMIT', () => {
    const store = createLogStore({ stamp: fixedStamp });
    for (let i = 0; i < DEFAULT_LOG_LIMIT + 25; i += 1) store.add('line ' + i);
    const lines = store.getSnapshot();
    expect(lines).toHaveLength(DEFAULT_LOG_LIMIT);
    expect(lines[lines.length - 1]).toBe('12:00:00  line ' + (DEFAULT_LOG_LIMIT + 24));
  });
});
