import { createLogStore } from './logStore';

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
