# `busymate-ai-web/1` — the web SDK wire (bridge `busymate-ai-v1`)

This is the whole contract between a web page using `@busymate/ai-web` and the
hosted Busymate AI chat it frames. The SDK pins it: a hosted-chat release never
changes what your page sends or accepts, and a new wire is a new SDK version
and a new contract file, never an edit to this one.

`contract.json` in this directory is the same contract as data. The SDK's tests
check the code against it, and the release manifest pins both files' SHA-256.

## Why a pinned wire

- The hosted chat (the frame) is served by busymate.ai and changes every day.
  The page side used to be a served loader script that changed with it. The SDK
  moves the page side into a versioned package: the frame URL, the message
  names and fields, the origin pins and the identity answers below are fixed
  for SDK 0.x and 1.x.
- The hosted chat keeps accepting every message name it ever shipped
  (`busymate.identity/v1`, "aliases are permanent by design"). New capabilities
  are additive and optional: a frame message this SDK does not know is ignored
  (and surfaced as a `message` event); a field it does not know is ignored.
- The plain snippet (`<script src="https://<assistant>.busymate.ai/embed/v1.js">`)
  speaks the same wire and keeps working. The two must not run for the same
  assistant on one page.

## The frame

The SDK creates one `<iframe>`:

```
https://<origin>/support/<assistant>?channel=embed&bridge=busymate-ai-v1&host=<page origin>&page=<page path>[&locale=<tag>][&instance=<random>]#bmai_visitor=<token>[&bmai_token=<jwt>&bmai_nonce=<nonce>]
```

| Part | Meaning |
|---|---|
| `<origin>` | The assistant's serving origin: `https://<assistant>.busymate.ai` or your verified custom domain. Exact origin, no wildcard. |
| `channel=embed` | A parent web page owns this frame. The frame refuses to start unless the parent's origin is one of the workspace's allowed embed origins. |
| `bridge=busymate-ai-v1` | Opts into the product-neutral `busymate.ai.v1.*` vocabulary below (not the historical `support.chat.v1.*`). |
| `host`, `page` | `location.origin` and `location.pathname` of your page. The frame prefers `location.ancestorOrigins[0]` where the browser has it; `host` is the fallback and is never more trusted than that. No query, no fragment. |
| `locale` | Optional first-paint locale (BCP 47). |
| `instance` | Optional; a new value is a guaranteed new session. The SDK does not set it on a normal launch. |
| Fragment | Never sent in a request, a `Referer` or an access log. `bmai_visitor` is the durable first-party visitor token; `bmai_token`/`bmai_nonce` an optional one-time launch assertion (an identity given before mount, or the sign-in return). |

Attributes: `sandbox="allow-scripts allow-forms allow-same-origin"`,
`allow="tools; microphone; autoplay"`, `referrerpolicy="strict-origin-when-cross-origin"`.

## Transport and trust

`window.postMessage`, structured-clone objects (never JSON strings).

- **Frame → host**: the SDK accepts a message only when `event.source` is its own
  iframe's `contentWindow` **and** `event.origin` equals `<origin>` exactly.
  Anything else is dropped before it is read.
- **Host → frame**: the SDK posts only to its iframe's `contentWindow`, with
  `targetOrigin` = `<origin>`, never `*`. The frame checks
  `event.source === window.parent` and the parent origin itself.
- Commands (`ask`, `theme`, `locale`, identity offers and controls sent
  unprompted) are queued (at most 8) until the frame posts `ready` or
  `resizable_request`: the iframe's `load` event does not prove the chat listens.
  Answers to an ask are posted at once.

## Frame → host

| Type | Fields | The SDK |
|---|---|---|
| `busymate.ai.v1.ready` | `visitorKind` (`anonymous`/`identified`), `displayClaims` | Flushes the queue; emits `ready`; drives link status. Posted after every session (re)mint. |
| `busymate.ai.v1.close` | — | Closes the panel (`close`, source `frame`) and returns focus to the launcher. Inline: emits `close` only. |
| `busymate.ai.v1.open_url` | `url` | Opens `https:`/`http:` URLs with `noopener,noreferrer`; anything else is ignored. |
| `busymate.ai.v1.navigate` | `href` | Same-origin only: emits `navigate`, calls `onNavigate`, else History API push + `popstate` + `busymate:hostnavigate`, falling back to a normal navigation after 300 ms. |
| `busymate.ai.v1.auth_request` | `url` | In-chat sign-in: emits `signInRequest`, calls `onSignInRequest`, else navigates this tab to the `https` URL with `return_to` = this page (fragment removed). |
| `busymate.ai.v1.identity_request` | `v:1`, `reason`, `deadlineAt` | Answers from your provider (below). |
| `busymate.ai.v1.resize_to` | `w`, `h` | Live drag size (floating panel above 640 px only). |
| `busymate.ai.v1.resize_by` | `dw`, `dh` | Keyboard resize step; persisted. |
| `busymate.ai.v1.resize_end` | — | Persists the size (`bm_widget_size:<assistant>`). |
| `busymate.ai.v1.resizable_request` | — | Flushes the queue; answers `resizable`. |
| `busymate.ai.v1.session_ended` | `sessionId` | Emits `sessionEnded`. |
| `busymate.identity.v1.ack` | `v:1`, `outcome` | `identified` / `anonymous` / `rejected:<code>`: drives link status. Declared by the hosted identity contract; the frame does not emit it yet. |
| `bmai:pip:prepare` | — | Declined with `bmai:pip:ready {ok:false, reason:"blocked"}`: the floating picture-in-picture window needs the hosted loader's helper, which this SDK version does not load. |

Every message from the pinned frame whose type starts with `busymate.` is also
emitted as a `message` event, including types this version does not act on.

## Host → frame

| Type | Fields | When |
|---|---|---|
| `busymate.ai.v1.identity` | `token`, `nonce`, `hc` | Here is the visitor: an answer to an ask, or an in-place offer (`identify`, `identityChanged`, `switchAccount`, a late answer). |
| `busymate.identity.v1.unavailable` | `v:1`, `reason`, `hc` | I cannot name anyone: `not_signed_in` (provider returned null, or `account()` is null), `mint_failed` (provider threw), `unsupported` (no answer within the frame's deadline: continue with what you hold; a late identity still upgrades in place). |
| `busymate.identity.v1.revoked` | `v:1`, `reason` | `signed_out`, `switched` or `expired`: the frame drops the verified identity, ends the session and clears the previous person's transcript, in place. |
| `busymate.ai.v1.ask` | `requestId`, `prompt`, `submit?` | `ask(text, { submit })`. |
| `busymate.ai.v1.theme` | `theme` | `light`, `dark` or `system`. Not persisted by the frame. |
| `busymate.ai.v1.locale` | `locale` | A BCP 47 tag, or `null` to unpin. |
| `busymate.ai.v1.keyboard` | `inset` | Always 0 from this SDK: on a phone the full-screen panel is fitted to the visual viewport instead. |
| `busymate.ai.v1.resizable` | `resizable`, `minW`, `minH`, `maxW`, `maxH`, `side` | Whether the frame may show resize handles, and the bounds. |
| `bmai:pip:ready` | `ok`, `reason` | See `bmai:pip:prepare`. |

`hc` is the host class the hosted chat records for diagnostics: always
`web-configure` from this SDK.

## Identity answers

Your provider (`getIdentity`) receives `{ nonce, reason }`: a fresh 256-bit
random nonce and why the chat asks (`launch`, `restart`, `refresh`, `resume`,
`reconnect`, `retry`; the SDK's own calls use `changed`, `switch`). It returns
a fresh `{ token, nonce }` from your backend, `null` when signed out, or throws.

1. If `account()` is configured and returns a different account than at the
   last ask, the SDK first sends `revoked` (`switched`, or `signed_out` for
   null). Signed out answers `unavailable: not_signed_in` without calling the provider.
2. A one-time identity already held (the sign-in return fragment, or
   `identify()` before mount) rides the frame URL fragment instead.
3. With no provider set, the ask is parked and answered (as an in-place offer)
   the moment `setIdentityProvider()` is called.
4. Otherwise the provider is called. The SDK answers within
   `min(identityBudgetMs (1500), deadlineAt − now − 100 ms)`; past that it
   answers `unavailable: unsupported`, and the identity, when it lands, is
   offered in place. A provider that has not settled after 15 s is `mint_timeout`.
5. The same token is never offered twice. A launch assertion is single-use: never cache one.

Your backend signs an ES256 JWT with `iss`, `aud`, your workspace claim, `sub`
(your stable user id, never an email), the `nonce`, a unique `jti`, and
`exp − iat` ≤ 120 s, and publishes the public key at `/.well-known/jwks.json`.
See <https://busymate.ai/docs/guides/identity-backend-signing>.

## Link status

The SDK keeps one link status and emits it as `linkStatus`:
`{ state, reason, source, at, detail? }`. `state` is `unlinked`, `linking`,
`linked` or `failed`. `reason` is a **stable string**; new codes may appear in
any minor version, so treat unknown values as opaque. `source` is `sdk` (decided
on your page) or `frame` (reported by the hosted chat). `detail` never contains
a token, nonce or account id.

| State | Reason | Meaning |
|---|---|---|
| unlinked | `anonymous` | Initial state with a provider; or the chat runs anonymous again. |
| unlinked | `no_provider` | No identity provider is set. |
| unlinked | `not_signed_in` | The provider returned null, or `account()` is null. |
| unlinked | `signed_out`, `switched`, `expired` | Your page withdrew the identity. |
| linking | `identity_requested` | The chat asked; the provider is minting. |
| linking | `identity_offered` | A token was sent; waiting for the chat to verify it. |
| linking | `account_changed` | `identityChanged()` or `switchAccount()` is minting. |
| linked | `identified` | The chat's session is identified (`ready` with `visitorKind: identified`). |
| failed | `mint_failed` | The provider threw (HTTP error, network). |
| failed | `mint_timeout` | The provider did not settle within 15 s. |
| failed | `invalid_identity` | The provider returned something other than `{ token, nonce }` or null. |
| failed | `nonce_mismatch` | Your endpoint did not echo the nonce (`mintFromEndpoint`). |
| failed | `not_verified` | A token was offered but the chat stayed anonymous for 6 s: the hosted verifier refused it (claims, JWKS, clock skew). The Console's linking timeline names the cause. |
| failed | `origin_not_allowed` | `/api/embed-status` says this page may not frame the chat. |
| failed | *code* | `source: frame`: the code after `rejected:` in `busymate.identity.v1.ack`, from the hosted verifier. The vocabulary is owned by the account-linking work (busymate-ai-src#2069). |

## First-party storage

Shared with the hosted loader, so a site that moves to the SDK keeps its visitors.

| Key | Store | Lifetime |
|---|---|---|
| `bm_support_visitor:<assistant>` | cookie (`SameSite=Lax`, `Secure` on https) + `localStorage` | ~13 months; written on the first open, never before `releaseConsent()` with `consent: "wait"` |
| `bm_widget_open:<assistant>` | `sessionStorage` | this tab |
| `bm_widget_size:<assistant>` | `localStorage` | until cleared |

## Embed preflight

On the first open (inline: at mount), unless `preflight: false`:
`GET <origin>/api/embed-status?assistant=<assistant>&ancestors=<page origin, then ancestor origins>`
with `credentials: "omit"` → `{ frameable: boolean }`. `false` reports
`origin_not_allowed`. Any other answer or a network error changes nothing.

## Compatibility promise

- Every SDK release keeps this wire. Breaking it requires `CONTRACT-v2.md`, a
  new major SDK version and an announcement; v1 keeps working.
- Additions are additive: new optional fields, new message types that older
  SDKs ignore, new link-status reasons.
- A working anonymous chat is the floor: if identity cannot be established the
  visitor can still chat.
