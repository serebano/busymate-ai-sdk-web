# Events

```ts
const off = chat.on("ready", ({ visitorKind, displayClaims }) => { /* … */ });
off();
```

Listeners are typed (`BusymateChatEvents`). A throwing listener is logged and never stops the others.

| Event | Payload | When |
|---|---|---|
| `ready` | `{ visitorKind, displayClaims? }` | A chat session is live (after every session mint, so again after an identity upgrade). `visitorKind` is `anonymous` or `identified`; `displayClaims` holds what the chat chose to share (for example `name`). |
| `open` / `close` | `{ source }` | The panel opened or closed. `source`: `api`, `launcher`, `frame` (the chat's ✕), `escape`, `restore` (re-opened on the next page), `navigate`. Inline mode emits `close` (source `frame`) when the chat's ✕ is pressed and leaves the decision to you. |
| `linkStatus` | `LinkStatus` | See below. `onLinkStatus(fn)` is the same stream, called at once with the current value. |
| `message` | `{ type, data }` | Every `busymate.*` message from the pinned frame, including types this version does not act on. For observability; never contains a token. |
| `navigate` | `{ href }` | A reply linked to a page on your origin. |
| `signInRequest` | `{ url }` | The chat's "Sign in" asked for your login. |
| `sessionEnded` | `{ sessionId? }` | The chat says its session is over (gate your own "ask" buttons on it). |
| `error` | `{ code, message }` | `origin_not_allowed` (preflight), `frame_silent` (an open chat said nothing for 12 s), `invalid_option`. |

## Link status

```ts
interface LinkStatus {
  state: "unlinked" | "linking" | "linked" | "failed";
  reason: string;          // stable code; unknown values are possible
  source: "sdk" | "frame"; // decided on your page, or reported by the hosted chat
  at: number;              // epoch ms
  detail?: string;         // human hint; never a token, nonce or account id
}
```

| State | Reasons |
|---|---|
| `unlinked` | `anonymous`, `no_provider`, `not_signed_in`, `signed_out`, `switched`, `expired` |
| `linking` | `identity_requested`, `identity_offered`, `account_changed` |
| `linked` | `identified` |
| `failed` | `mint_failed`, `mint_timeout`, `invalid_identity`, `nonce_mismatch`, `not_verified`, `origin_not_allowed`, and codes from the hosted verifier (`source: "frame"`) |

The `reason` field is a contract: codes are never renamed or removed, and new ones are added in minor versions. Codes reported by the hosted chat (from the account-linking work, busymate-ai-src#2069) arrive as additional strings, so always keep a default branch:

```ts
chat.onLinkStatus((s) => {
  if (s.state === "failed") report("busymate_link_failed", { reason: s.reason, source: s.source });
});
```

## Window-level signals

For code that does not hold the handle (floating modes only): `<html data-bmai-chat="open|closed">`, and `bmai:chat-open` / `bmai:chat-close` on `window` with `detail.assistant`. Same-origin navigation also dispatches `busymate:hostnavigate` (`detail.href`) for pages without a History-API router.
