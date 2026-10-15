import { IFRAME_ALLOW, IFRAME_SANDBOX } from "./wire.js";
import { parseExactOrigin, defaultOrigin } from "./origins.js";

export interface CspOptions {
  /** The assistant's serving origin (default `https://<assistant>.busymate.ai`). */
  readonly origin?: string;
  readonly assistant?: string;
  /** Your mint endpoint's origin when it is not your page's own origin. */
  readonly mintOrigin?: string;
  /** Where you serve the SDK's script-tag build from, when not `'self'`. */
  readonly scriptOrigin?: string;
}

/**
 * The Content-Security-Policy additions your page needs for the SDK, as
 * directive → sources. Merge them into your existing policy; do not replace it.
 *
 * - `frame-src`: the chat frame.
 * - `connect-src`: the embed preflight (`/api/embed-status`) and, when it is on
 *   another origin, your mint endpoint.
 * - `script-src`: only when you load the script-tag build from somewhere else.
 *   The SDK itself loads no remote script.
 * - `style-src`: the SDK injects one `<style>` element; pass `nonce` to
 *   `createBusymateChat` when your policy uses nonces, otherwise allow `'self'`
 *   plus that nonce or a hash.
 */
export function cspDirectives(options: CspOptions): Record<string, string[]> {
  const origin = parseExactOrigin(options.origin ?? (options.assistant ? defaultOrigin(options.assistant) : ""));
  if (!origin) throw new TypeError("cspDirectives: an exact https origin (or assistant) is required");
  const directives: Record<string, string[]> = {
    "frame-src": [origin],
    "connect-src": [origin],
  };
  const mint = options.mintOrigin ? parseExactOrigin(options.mintOrigin) : null;
  if (mint && mint !== origin) directives["connect-src"]!.push(mint);
  const script = options.scriptOrigin ? parseExactOrigin(options.scriptOrigin) : null;
  if (script) directives["script-src"] = [script];
  return directives;
}

/** The same additions as a header fragment, for example `frame-src https://acme.busymate.ai; connect-src …`. */
export function cspHeader(options: CspOptions): string {
  return Object.entries(cspDirectives(options))
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * The iframe attributes the SDK sets. Do not loosen them, and do not tighten
 * them either: the chat needs scripts, forms and its own origin's storage, and
 * `microphone`/`autoplay` for voice. Your page must not send a
 * `Permissions-Policy` that blocks `microphone` for the chat origin if you want voice.
 */
export const IFRAME_POLICY = Object.freeze({
  sandbox: IFRAME_SANDBOX,
  allow: IFRAME_ALLOW,
});
