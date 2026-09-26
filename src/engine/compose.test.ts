import { compose, keyFromUrl, uniqueKey } from './compose';

describe('uniqueKey', () => {
  test('returns the key unchanged when it is free', () => {
    expect(uniqueKey({}, 'users')).toBe('users');
  });

  test('suffixes _2, _3… when the key is taken', () => {
    expect(uniqueKey({ users: 1 }, 'users')).toBe('users_2');
    expect(uniqueKey({ users: 1, users_2: 1 }, 'users')).toBe('users_3');
  });

  test.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'does not treat Object.prototype member %j as taken',
    (key) => {
      expect(uniqueKey({}, key)).toBe(key);
    }
  );
});

describe('compose', () => {
  const src = (key: string, body: string) => ({ key, body });

  test('object mode keys each parsed body', () => {
    expect(compose([src('users', '[1]'), src('orders', '{"n":2}')], 'object')).toEqual({
      users: [1],
      orders: { n: 2 }
    });
  });

  test('object mode keeps both of two identical keys', () => {
    expect(compose([src('users', '1'), src('users', '2')], 'object')).toEqual({ users: 1, users_2: 2 });
  });

  test('an empty key falls back to "response"', () => {
    expect(compose([src('', '1')], 'object')).toEqual({ response: 1 });
  });

  test('a key named like an Object.prototype member keeps its name', () => {
    const out = compose([src('constructor', '1'), src('toString', '2')], 'object');
    expect(JSON.parse(JSON.stringify(out))).toEqual({ constructor: 1, toString: 2 });
  });

  test('a __proto__ key is exported, not swallowed as a prototype assignment', () => {
    const out = compose([src('__proto__', '{"polluted":true}')], 'object');
    expect(JSON.stringify(out)).toBe('{"__proto__":{"polluted":true}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('array mode keeps list order and ignores keys', () => {
    expect(compose([src('b', '2'), src('a', '1')], 'array')).toEqual([2, 1]);
  });

  test('a body that will not parse is kept as a raw string', () => {
    expect(compose([src('page', '<html>')], 'object')).toEqual({ page: '<html>' });
    expect(compose([src('page', '<html>')], 'array')).toEqual(['<html>']);
  });
});

describe('keyFromUrl', () => {
  test.each([
    ['https://x.dev/v1/users', 'users'],
    ['https://x.dev/v1/users/42', 'users'],
    ['https://x.dev/api/orders.json', 'orders'],
    ['https://x.dev/v1/users?page=2', 'users'],
    ['https://x.dev/items/0f8fad5b-d9cb-469f-a165-70867728950e', 'items'],
    ['https://x.dev/order-lines', 'order_lines'],
    ['https://x.dev/', 'response'],
    ['https://x.dev/123/456', 'response'],
    ['not a url/at all', 'at_all']
  ])('%s -> %s', (url, key) => {
    expect(keyFromUrl(url)).toBe(key);
  });
});
