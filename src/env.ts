// SSR safety: nothing in this package touches `window` or `document` at import
// time. Every DOM access goes through these guards.

/** True in a browser document (not during SSR, not in a worker). */
export function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined" && typeof document.createElement === "function";
}

/** A url-safe random string from the platform CSPRNG (never Math.random for a nonce). */
export function randomId(bytes = 32): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues is required to mint a launch nonce");
  }
  const buffer = new Uint8Array(bytes);
  c.getRandomValues(buffer);
  let text = "";
  for (const byte of buffer) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Storage blocked (private mode, partitioned frame, quota): the chat still works.
  }
}
