/** Pure helpers — no browser, no React. */

/**
 * UTF-8 byte length, counted without encoding. `TextEncoder.encode` would
 * allocate (and immediately discard) a buffer the size of the whole body.
 */
export function byteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // surrogate pair: one 4-byte character, skip its second half
        i += 1;
      } else bytes += 3; // lone high surrogate encodes as U+FFFD
    } else bytes += 3; // BMP char, or a lone surrogate (also U+FFFD)
  }
  return bytes;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
