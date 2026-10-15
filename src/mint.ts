import { IdentityError } from "./identity.js";
import type { BusymateIdentity, IdentityProvider } from "./types.js";

export interface MintEndpointOptions {
  /**
   * Your existing auth: return a bearer access token for your API, or null
   * when signed out (no request is made then). Omit to rely on cookies only.
   */
  readonly getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Default "include": your session cookie authenticates the mint. */
  readonly credentials?: RequestCredentials;
  /** Extra headers (for example a CSRF token). Never a signing key. */
  readonly headers?: Record<string, string>;
  /** Send `returnTo` (this page without query or fragment) in the body. Default true. */
  readonly sendReturnTo?: boolean;
  /** For tests: the fetch to use. */
  readonly fetch?: typeof fetch;
}

/**
 * The standard identity provider: POST `{ nonce, returnTo }` to YOUR
 * authenticated mint endpoint and return its `{ token, nonce }`.
 *
 * - 401 or 403 means signed out: the chat stays anonymous (no error).
 * - Any other non-2xx throws `mint_failed`; a missing token throws
 *   `invalid_identity`; a nonce that does not come back throws `nonce_mismatch`.
 * - Redirects are refused, so your session credential is never forwarded elsewhere.
 * - The response is never cached or stored: a launch assertion is single-use.
 */
export function mintFromEndpoint(url: string, options: MintEndpointOptions = {}): IdentityProvider {
  let endpoint: URL;
  try {
    endpoint = new URL(url, typeof location !== "undefined" ? location.href : undefined);
  } catch {
    throw new TypeError("mintFromEndpoint: invalid endpoint URL");
  }
  const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) {
    throw new TypeError("mintFromEndpoint: the endpoint must be https");
  }
  return async ({ nonce }): Promise<BusymateIdentity | null> => {
    const doFetch = options.fetch ?? fetch;
    const headers: Record<string, string> = { "content-type": "application/json", ...(options.headers ?? {}) };
    if (options.getAccessToken) {
      const accessToken = await options.getAccessToken();
      if (!accessToken) return null;
      headers.authorization = "Bearer " + accessToken;
    }
    const body: Record<string, string> = { nonce };
    if (options.sendReturnTo !== false && typeof location !== "undefined") {
      const returnTo = new URL(location.href);
      returnTo.search = "";
      returnTo.hash = "";
      body.returnTo = returnTo.href;
    }
    let response: Response;
    try {
      response = await doFetch(endpoint.href, {
        method: "POST",
        credentials: options.credentials ?? "include",
        cache: "no-store",
        redirect: "error",
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new IdentityError("mint_failed", "mint request failed: " + (error instanceof Error ? error.message : String(error)));
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new IdentityError("mint_failed", `mint endpoint answered HTTP ${response.status}`);
    let json: { token?: unknown; nonce?: unknown };
    try {
      json = (await response.json()) as { token?: unknown; nonce?: unknown };
    } catch {
      throw new IdentityError("invalid_identity", "mint endpoint did not return JSON");
    }
    if (typeof json.token !== "string" || !json.token) throw new IdentityError("invalid_identity", "mint response has no token");
    if (json.nonce !== nonce) throw new IdentityError("nonce_mismatch", "mint response did not echo the nonce");
    return { token: json.token, nonce };
  };
}
