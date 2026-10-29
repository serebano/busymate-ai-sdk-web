# Migrating from the snippet

The snippet (`<script src="https://acme.busymate.ai/embed/v1.js" data-assistant="acme" async>`) keeps working; nothing is switched off. Move to the SDK when you want the page side pinned to a version you choose, typed events and link status. **Run one or the other for an assistant on a page, never both.**

The SDK uses the same frame URL, iframe attributes and first-party keys (`bm_support_visitor:<assistant>`, `bm_widget_open:`, `bm_widget_size:`), so returning visitors keep their conversations.

| Snippet | SDK |
|---|---|
| `<script src=…/embed/v1.js data-assistant="acme">` | `createBusymateChat({ assistant: "acme", origin: "https://acme.busymate.ai" }).mount()` (`origin` = the snippet's `src` origin) |
| `data-label`, `data-aria-label`, `data-title` | `launcher: { label, ariaLabel }`, `title` |
| `data-launcher="hidden"` | `mode: "panel"` |
| (inline frame snippet) | `mode: "inline", container` |
| `data-locale` | `locale` |
| `data-consent="wait"` + `BusymateAI.releaseConsent()` | `consent: "wait"` + `chat.releaseConsent()` |
| `data-nonce` / `nonce` attribute | `nonce` |
| `window.BusymateAI = { getIdentity }` / `BusymateAI.configure({ getIdentity, account })` | `getIdentity`, `account` options or `setIdentityProvider()` |
| `BusymateAI.identityChanged()` | `chat.identityChanged()` |
| `BusymateAI.signedOut("signed_out")` | `chat.signedOut()` |
| `BusymateAI.signedOut("switched")` then `identityChanged()` | `chat.identityChanged()` (the same conversation upgrades in place; `switchAccount()` is a legacy alias) |
| `BusymateAI.identify({ token, nonce })` | `chat.identify(...)` (a token you already hold; otherwise `getIdentity`) |
| `BusymateAI.refreshIdentity()` | `chat.identityChanged()` (in place, no remount; `refreshIdentity()` is a legacy alias) |
| `open`, `close`, `toggle`, `isOpen`, `ask`, `setTheme`, `setLocale` | the same names on the handle |
| `window.addEventListener("message", …)` filtering `busymate.ai.v1.ready` | `chat.on("ready", …)`, `chat.on("message", …)` |
| `bmai:chat-open` / `bmai:chat-close`, `html[data-bmai-chat]` | unchanged (also `chat.on("open"/"close")`) |
| `busymate:hostnavigate` | unchanged (also `onNavigate`, `chat.on("navigate")`) |
| `BusymateAI.registerPageTools(...)`, `registerDeclarativeForms`, `unregisterPageTools` | the same names on the handle ([page tools](page-tools.md)) |
| `data-layout="push"`, the floating window, the Console launcher look | not in this version: keep the snippet on pages that need them |

## Steps

1. Install the SDK (see the README) and remove the snippet's `<script>` from the pages you move.
2. Move your `getIdentity` into the `getIdentity` option, or use `mintFromEndpoint(yourEndpoint)` when your endpoint follows the standard `POST { nonce, returnTo }` shape.
3. Replace the `assistantIdentityChanged` / `assistantSignedOut` helpers with `chat.identityChanged()` / `chat.signedOut()` in your auth callbacks.
4. Add the [CSP directives](csp.md) (`script-src` for the chat origin is needed only if you call `registerPageTools()`; see [page tools](page-tools.md)).
5. Watch `onLinkStatus` on a staging page: a signed-in user should reach `linked · identified`.
