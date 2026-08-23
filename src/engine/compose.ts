import { safeParse } from './json';

/**
 * Builds one JSON document out of several captured response bodies.
 * Pure — no browser, no React, no store. This is the seed of the mesh engine.
 */

export type ComposeMode = 'object' | 'array';

/** One slot in the composition: which capture, and (object mode) under what key. */
export interface ComposeItem {
  id: string;
  key: string;
}

export interface ComposeSource {
  key: string;
  body: string;
}

/** A body that will not parse is kept as a raw string rather than dropped. */
function valueOf(body: string): unknown {
  const parsed = safeParse(body);
  return parsed.ok ? parsed.value : body;
}

export function compose(sources: ComposeSource[], mode: ComposeMode): unknown {
  if (mode === 'array') return sources.map((source) => valueOf(source.body));

  const out: Record<string, unknown> = {};
  for (const source of sources) {
    out[uniqueKey(out, source.key || 'response')] = valueOf(source.body);
  }
  return out;
}

/** `users`, `users_2`, `users_3`… so two drops of the same endpoint both survive. */
export function uniqueKey(taken: Record<string, unknown>, key: string): string {
  if (!(key in taken)) return key;
  let n = 2;
  while (key + '_' + n in taken) n += 1;
  return key + '_' + n;
}

function isIdLike(segment: string): boolean {
  return segment.length >= 16 && /^[0-9a-f-]+$/i.test(segment);
}

/**
 * Suggests an object key from a URL: the last path segment that looks like a
 * name rather than an id. `/v1/users/42` → `users`, `/api/orders.json` → `orders`.
 */
export function keyFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }

  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/\.[a-z0-9]+$/i, ''));

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const raw = segments[i];
    if (/^\d+$/.test(raw) || isIdLike(raw)) continue;
    const key = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (key) return key;
  }
  return 'response';
}
