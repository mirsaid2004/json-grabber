import { byteLength, formatSize } from './bytes';

describe('byteLength', () => {
  test.each([
    '',
    'abc',
    '{"a":1}',
    'héllo',
    '日本語',
    '👋🏽 hi',
    '\u{1F600}',
    '\uD83D', // lone high surrogate
    '\uDE00', // lone low surrogate
    'a\uD83Db' // high surrogate not followed by a low one
  ])('matches TextEncoder for %j', (s) => {
    expect(byteLength(s)).toBe(new TextEncoder().encode(s).length);
  });
});

test('formatSize picks a unit', () => {
  expect(formatSize(512)).toBe('512 B');
  expect(formatSize(2048)).toBe('2.0 KB');
  expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
});
