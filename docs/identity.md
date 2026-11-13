# Identity linking

A visitor signed in to your product is linked to their account in the chat by a **one-time launch assertion** that **your backend** signs. The page never sees a key and the chat never reads your session: it asks, and your page answers with a fresh `{ token, nonce }`.

## 1. Your backend: one mint endpoint

One authenticated endpoint, for example `POST /api/bmai/identity`, that:

1. requires your own session (cookie or bearer); signed out answers `401`;
2. reads `{ nonce }` from the body (the SDK also sends `returnTo`; ignore it);
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

The names are the identity contract's: `getIdentity`, `identityChanged`, `signedOut`, `account`. `logout()`, `setUser(null)`, `switchAccount()` and `refreshIdentity()` are accepted aliases and are not documented further. The full flow, including the actor token your MCP verifies, is on [Sign-in and identity](https://busymate.ai/docs/identity).

| Your product | Call | The chat |
|---|---|---|
| Signed in, token rotated | `chat.identityChanged()` | Same conversation, now identified (in place, no reload). |
| Switched account | `chat.identityChanged()` | The same conversation upgrades in place for the new person (`account()` also catches a missed switch). |
| Signed out | `chat.signedOut()` | Drops the verified identity, ends the session, clears the transcript. **Never skip this**: without it the next person at this browser sees the previous person's chat. |
| Session expired | `chat.signedOut("expired")` | As above, labelled expired. |
| You already hold a token | `chat.identify({ token, nonce })` | Offered in place (before `mount()`: carried on the frame URL fragment). |

Route changes need nothing: the chat re-asks on resume, reconnect and expiry.

## 4. In-chat sign-in

When a guest taps "Sign in" in the chat, it asks your page to send them to your login (the URL configured in the Console). By default the SDK navigates this tab to that URL with `return_to` = this page. Your login returns to `return_to#bmai_token=…&bmai_nonce=…`; on the next `mount()` the SDK removes that fragment from the address bar before anything else can read it and launches the chat identified. To keep the visitor on the page, register a `sign_in` [page tool](page-tools.md): the chat shows a card (email and code, password, or one button), your page signs the user in and the chat re-asks `getIdentity` in place. Or pass `onSignInRequest(url)`, run your own login (a modal), return `true`, then call `identityChanged()`.

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
| `failed · <code>` (`source: "frame"`) | A reason reported by the hosted verifier itself. |

Never log tokens, nonces or account ids while troubleshooting; the SDK's statuses and events contain none.
