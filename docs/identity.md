# Identity linking

A visitor signed in to your product is linked to their account in the chat by a **one-time launch assertion** that **your backend** signs. The page never sees a key and the chat never reads your session: it asks, and your page answers with a fresh `{ token, nonce }`.

## 1. Your backend: one mint endpoint

One authenticated endpoint, for example `POST /api/bmai/identity`, that:

1. requires your own session (cookie or bearer); signed out answers `401`;
2. reads `{ nonce, returnTo }` from the body;
3. signs an **ES256** JWT: `iss` (your issuer), `aud` (as registered), your workspace claim, `sub` (your stable internal user id, never an email or session id), `nonce` (echoed verbatim), a unique `jti`, `iat`, and `exp` at most 120 s after `iat`;
4. answers `201 { token, nonce, expiresIn }` with `Cache-Control: no-store`;
5. publishes the **public** key at `/.well-known/jwks.json` with a `kid`.

Copy a reference implementation (Node, PHP, Python, Go) from the [backend signing guide](https://busymate.ai/docs/guides/identity-backend-signing), register the provider in Console › Integration › Identity, and check it with the conformance CLI. Never cache or reuse a token: each is single-use.

## 2. Your page: the provider

```ts
import { createBusymateChat, mintFromEndpoint } from "@busymate/ai-web";

const chat = createBusymateChat({
  assistant: "acme",
  getIdentity: mintFromEndpoint("/api/bmai/identity", {
    getAccessToken: () => auth.accessToken(), // optional: bearer auth; null = signed out, no request
  }),
  account: () => auth.userId ?? null,        // optional: detects switches you forget to report
});
chat.mount();
```

`mintFromEndpoint` POSTs `{ nonce, returnTo }` with your cookies (`credentials: "include"`), `cache: "no-store"` and `redirect: "error"` (your credential is never forwarded elsewhere). `401`/`403` = signed out (`null`); other errors throw `IdentityError` with `code` `mint_failed`, `invalid_identity` or `nonce_mismatch`.

A custom provider is any function `({ nonce, reason }) => { token, nonce } | null | Promise<…>`. Use the given nonce, return `null` when signed out, throw on failure. Never return a cached pair.

## 3. Your auth events

| Your product | Call | The chat |
|---|---|---|
| Signed in, token rotated | `chat.identityChanged()` | Same conversation, now identified (in place, no reload). |
| Switched account | `chat.switchAccount()` | Withdraws the previous person (transcript cleared), then links the next. |
| Signed out | `chat.logout()` | Drops the verified identity, ends the session, clears the transcript. **Never skip this**: without it the next person at this browser sees the previous person's chat. |
| Session expired | `chat.logout("expired")` | As above, labelled expired. |
| You already hold a token | `chat.identify({ token, nonce })` / `chat.setUser(...)` | Offered in place (before `mount()`: carried on the frame URL fragment). |

Route changes need nothing: the chat re-asks on resume, reconnect and expiry.

## 4. In-chat sign-in

When a guest taps "Sign in" in the chat, it asks your page to send them to your login (the URL configured in the Console). By default the SDK navigates this tab to that URL with `return_to` = this page. Your login returns to `return_to#bmai_token=…&bmai_nonce=…`; on the next `mount()` the SDK removes that fragment from the address bar before anything else can read it and launches the chat identified. To keep the visitor on the page, pass `onSignInRequest(url)`, run your own login (a modal), return `true`, then call `identityChanged()`.

## 5. Timing

The chat waits about 2 s for an answer. The SDK answers within `identityBudgetMs` (1.5 s) or the chat's own deadline, whichever is sooner. A slower provider is not a failure: the chat starts anonymous and the identity, when it arrives, upgrades it in place. With no provider at all the chat is told `not_signed_in` after 250 ms; a provider set later still upgrades it.

## 6. Link status and troubleshooting

Every step is reported as a [link status](events.md#link-status) with a stable `reason`:

| You see | Check |
|---|---|
| `unlinked · no_provider` | You set no `getIdentity`. |
| `unlinked · not_signed_in` | Your provider returned null (or `account()` is null). Expected for guests. |
| `failed · mint_failed` | Your endpoint errored or is unreachable (CORS, 5xx). `detail` has the HTTP status. |
| `failed · nonce_mismatch` | Your endpoint did not echo the nonce it was given. |
| `failed · invalid_identity` | Your provider returned something other than `{ token, nonce }`. |
| `failed · mint_timeout` | Your provider never settled (15 s). |
| `failed · not_verified` | The token reached the chat but the hosted verifier refused it: wrong `iss`/`aud`/workspace claim, unknown `kid`, an expired token or clock skew. Open the conversation in the Console: its account-linking timeline names the reason. |
| `failed · origin_not_allowed` | Add this page's origin to Console › Integration › allowed origins. |
| `failed · <code>` (`source: "frame"`) | A reason reported by the hosted verifier itself: see [Frame reason codes](#frame-reason-codes). |

## Frame reason codes

The `<code>` in `rejected:<code>` (link status `failed`, `source: frame`). One vocabulary,
owned by the hosted chat (`busymate-ai-src`, `packages/chat-wire/src/identityLinkReasons.ts`);
the Console's Account linking timeline explains the same codes. Additive: treat unknown codes
as opaque. `nonce_mismatch` and `origin_not_allowed` mean the same as the page-side codes above.
The hosted chat sends `busymate.identity.v1.ack` (`CONTRACT-v1.md`, frame → host) after each
identified launch: `identified`, or `rejected:<code>`; and `anonymous` once a launch settles with
no identity.

| Code | Meaning | Fix |
|---|---|---|
| `clock_skew` | The token expired, or its `iat` is in the future, by more than a minute. | Sync your signing server's clock (NTP). |
| `token_expired` | The token expired in flight. | Mint the token right before you return it; do not cache it. |
| `signature_invalid` | The signature does not verify against your published keys. | Sign with the private key whose public key is in your JWKS. |
| `unknown_kid` | The token's `kid` is not in your JWKS. | Publish the new key before you sign with it. |
| `jwks_unavailable` | Your JWKS could not be fetched. | Make the JWKS URL publicly reachable over HTTPS. |
| `claim_invalid` | A required claim (`aud`, `iss`, `sub`, `jti`, `iat`, `exp`, max age) is missing or wrong. | Match the claims in the identity settings. |
| `tenant_claim_mismatch` | The workspace claim names another workspace. | Put this workspace's value in the workspace claim. |
| `nonce_mismatch` | The token's nonce is not the one the chat asked with. | Bind the nonce you were given into the token. |
| `malformed_token` | Not a parseable JWT, or no issuer. | Return a compact ES256/RS256 JWT. |
| `provider_not_registered` | No enabled sign-in provider has the token's issuer. | Register and enable the provider, or fix `iss`. |
| `provider_not_published` | The provider is registered but not published. | Publish the support settings. |
| `issuer_owned_elsewhere` | Another workspace owns this issuer and workspace claim. | Use your own issuer or workspace claim value. |
| `verifier_misconfigured` | The provider has no usable algorithm. | Allow ES256 or RS256 on the provider. |
| `launch_replayed` | This token was already used; tokens are single-use. | Mint a new token for every ask. |
| `launch_failed` | The verified identity could not become a session. | Retry; if it persists, check the Console's Account linking timeline. |
| `origin_not_allowed` | This page's origin is not an allowed website of the workspace. | Add the origin to the workspace's allowed websites. |
| `verifier_error` | Any other verifier refusal. | See the Console's Account linking timeline. |

Never log tokens, nonces or account ids while troubleshooting; the SDK's statuses and events contain none.
