/** Exact-origin helpers. No wildcards, no paths, https only (localhost http for development). */

/** Parse an exact origin (`https://host[:port]`), or null. A path, query, fragment or credentials make it invalid. */
export function parseExactOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password) return null;
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) return null;
  if (raw.replace(/\/$/, "") !== url.origin) return null;
  return url.origin;
}

/** The default serving origin of an assistant. */
export function defaultOrigin(assistant: string): string {
  return `https://${assistant}.busymate.ai`;
}

/** The origin of a URL string, or null. */
export function originOf(href: string, base?: string): string | null {
  try {
    return new URL(href, base).origin;
  } catch {
    return null;
  }
}
