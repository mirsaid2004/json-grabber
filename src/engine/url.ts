/** URL helpers. Pure — the future rule matcher will live alongside these. */

/** Host + path + query, for display in the capture list and log. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname + (u.search ? u.search : '');
  } catch {
    return url;
  }
}

/** Sanitized slug from host + path, used to build export filenames. */
export function slugFromUrl(url: string): string {
  let path: string;
  try {
    const u = new URL(url);
    path = u.hostname + u.pathname;
  } catch {
    path = String(url);
  }
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'capture';
}

/** Case-insensitive substring match used by the capture filter. */
export function urlMatches(url: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return false;
  return url.toLowerCase().includes(needle);
}
