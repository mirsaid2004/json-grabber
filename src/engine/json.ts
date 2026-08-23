/** JSON helpers. Pure — the mesh/join engine will build on these. */

export function safeParse(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** Pretty-prints a JSON body; returns the raw text unchanged if it will not parse. */
export function prettyPrint(body: string): string {
  const parsed = safeParse(body);
  return parsed.ok ? JSON.stringify(parsed.value, null, 2) : body;
}
