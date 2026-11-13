# Configuration reference

## `createBusymateChat(options)`

Creating a chat validates the options and touches no DOM (safe during SSR). Call `mount()` in the browser.

| Option | Behavior |
|---|---|
| `assistant` | Required. Your assistant slug from Console › Integration (`[a-z0-9][a-z0-9-]{1,62}`). |
| `origin` | The assistant's serving origin: your verified custom AI domain, or `https://<assistant>.busymate.ai` (default). Exact `https` origin only: no wildcard, path or query. Use the origin your Console snippet's `src` uses. |
| `mode` | `launcher` (default): a floating button bottom-right (or left) that opens a panel. `panel`: the same panel with no button, opened by your UI through `open()`/`toggle()`/`ask()`. `inline`: the chat fills `container`, always visible. |
| `container` | Element or selector. Required for `inline`; for the floating modes, where the layer is appended (default `document.body`). |
| `launcher` | `{ label, ariaLabel, side }`. Default label "Ask AI"; the accessible name always contains the visible label (WCAG 2.5.3). `side`: `right` (default) or `left`. |
| `title` | The iframe's accessible title. Default: the launcher label. |
| `locale` | First-paint BCP 47 locale. Later: `setLocale(tag)`, or `setLocale(null)` to let the chat negotiate again. |
| `theme` | `light`, `dark` or `system`, sent when the chat is ready. Later: `setTheme()`. |
| `getIdentity` | Your identity provider, see [identity](identity.md). Set or replace later with `setIdentityProvider()`. |
| `account` | Optional `() => string \| null`: your page's current account id (null = signed out). Read in memory only, never sent. A change between the chat's asks withdraws the previous person's chat first. |
| `consent` | `"wait"` keeps the durable visitor cookie in memory until `releaseConsent()` (your CMP). Default: written on the first open. |
| `preflight` | Default `true`: on the first open (inline: at mount) ask `/api/embed-status` whether this page may frame the chat; `false` reports `origin_not_allowed`. |
| `openOnMount` | Open on mount. Default: re-open when the panel was open on the previous page of this tab. |
| `onSignInRequest(url)` | The chat's "Sign in" asked to send the visitor to your login. Return `true` when you handled it (for example a modal, then `identityChanged()`). Default: navigate this tab to the `https` URL with `return_to` set to this page. |
| `onNavigate(href)` | A reply linked to a page on your own origin. Return `true` when your router handled it. Default: `history.pushState` + `popstate` + a `busymate:hostnavigate` window event, then a normal navigation if nothing changed within 300 ms. On phones the panel closes first. |
| `nonce` | CSP nonce for the one `<style>` element the SDK adds. |
| `identityBudgetMs` | How long your provider may take before the chat is told to continue (default 1500, never past the chat's own deadline). A late identity still upgrades the chat in place. |

## The handle

| Member | |
|---|---|
| `mount()` / `unmount()` / `mounted` | Insert or remove every element and listener. `mount()` returns `false` outside a browser, when already mounted, or (inline) without a container. A handle can be mounted again. |
| `open()` / `close()` / `toggle()` / `isOpen()` | Floating modes. Inline is always open. |
| `ask(text, { submit })` | Opens the panel and sends `text` through the chat's composer (every guard a typed message gets). `submit: false` only fills the composer. `false` for empty text. Queued (8 at most) until the chat is ready. |
| `setTheme(theme)` / `setLocale(tag \| null)` | `false` for a value the chat does not accept. Never persisted by the chat. |
| `setIdentityProvider(provider, account?)` | Replace the provider (and optionally `account`). An ask that arrived before is answered in place. |
| `identify(identity)` / `setUser(identity \| null)` | Offer a server-signed `{ token, nonce }` now. Before `mount()` it rides the frame URL's fragment. `setUser(null)` = `logout()`. |
| `identityChanged()` | Sign-in, token rotation: re-ask the provider and upgrade in place. Resolves `true` when an identity was offered. |
| `logout(reason?)` | `signed_out` (default) or `expired`: the chat drops the identity, ends the session and clears the previous transcript. |
| `switchAccount(next?)` | Withdraw (`switched`) then link `next` or a fresh provider answer. |
| `linkStatus` / `onLinkStatus(fn)` | Current [link status](events.md#link-status); the listener is called at once and on every change. Returns unsubscribe. |
| `releaseConsent()` | Persist the visitor token once your consent manager allows. |
| `on(name, fn)` / `off(name, fn)` | [Typed events](events.md). `on` returns unsubscribe. |
| `frameUrl()` | The frame URL without its fragment (for support tickets). |
| `version`, `contractVersion`, `origin`, `assistant`, `mode` | Read-only facts. |

## Other exports

- `mintFromEndpoint(url, { getAccessToken, credentials, headers, sendReturnTo })`: the standard provider, see [identity](identity.md).
- `cspDirectives(options)`, `cspHeader(options)`, `IFRAME_POLICY`: see [CSP](csp.md).
- `IdentityError`, `isIdentity`, `parseExactOrigin`, `defaultOrigin`.
- `SDK_VERSION`, `CONTRACT_VERSION`, `BRIDGE_MARKER`, `EMBED_CHANNEL`, `IDENTITY_CONTRACT`, `FRAME_MESSAGE`, `HOST_MESSAGE`, the reason lists.

## Page-level signals

Floating modes publish what the hosted loader publishes, so CSS and scripts written for the snippet keep working: `<html data-bmai-chat="open|closed">` and `bmai:chat-open` / `bmai:chat-close` window events (`detail.assistant`).

## Not in this version

The floating picture-in-picture window (the chat's "pop out" control reports it unavailable), `data-layout="push"`, the Console launcher look and page-language reporting stay with the snippet for now. Page tools are in ([page tools](page-tools.md)).
