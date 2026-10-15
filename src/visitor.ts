import { safeGet, safeSet, randomId } from "./env.js";
import { FRAGMENT, VISITOR_TOKEN, visitorKey } from "./wire.js";
import type { BusymateIdentity } from "./types.js";

const VISITOR_MAX_AGE_S = 60 * 60 * 24 * 400; // ~13 months, the usual browser cap

function readCookie(key: string): string | null {
  try {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]+)"));
    return match && match[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(key: string, value: string): void {
  try {
    document.cookie =
      key + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + VISITOR_MAX_AGE_S + "; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
  } catch {
    // cookies blocked: localStorage (or memory) still carries the visitor
  }
}

/**
 * The visitor's durable, opaque, per-assistant token, first-party on YOUR page
 * (the frame's own storage is third-party: blocked or partitioned). The same
 * keys as the hosted loader (`bm_support_visitor:<assistant>`), so a site that
 * moves from the snippet to the SDK keeps its returning visitors. A new
 * visitor's token lives in memory until the first real interaction
 * (`persist()`), and never before consent when `consent: "wait"`.
 */
export class VisitorToken {
  readonly value: string;
  private persisted: boolean;

  constructor(private readonly assistant: string) {
    const key = visitorKey(assistant);
    const fromLocal = safeGet(() => localStorage, key);
    const fromCookie = readCookie(key);
    const existing = VISITOR_TOKEN.test(fromLocal ?? "") ? fromLocal : VISITOR_TOKEN.test(fromCookie ?? "") ? fromCookie : null;
    this.persisted = !!existing;
    this.value = existing ?? randomId(36).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 48);
  }

  get isPersisted(): boolean {
    return this.persisted;
  }

  persist(): void {
    if (this.persisted) return;
    this.persisted = true;
    const key = visitorKey(this.assistant);
    writeCookie(key, this.value);
    safeSet(() => localStorage, key, this.value);
  }
}

/**
 * A tenant login that returns to this page may carry the one-time launch
 * assertion in the fragment (`#bmai_token=…&bmai_nonce=…`). Consume it before
 * analytics can read it and hand it over once.
 */
export function consumeReturnIdentity(): BusymateIdentity | null {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get(FRAGMENT.token);
    const nonce = params.get(FRAGMENT.nonce);
    if (!token || !nonce) return null;
    params.delete(FRAGMENT.token);
    params.delete(FRAGMENT.nonce);
    const rest = params.toString();
    history.replaceState(history.state, "", location.pathname + location.search + (rest ? "#" + rest : ""));
    return { token, nonce };
  } catch {
    return null;
  }
}
