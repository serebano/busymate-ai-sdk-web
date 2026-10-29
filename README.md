# Busymate AI SDK for the Web — 0.2.0

Official versioned web SDK for Busymate AI hosted chat: `@busymate/ai-web`. One package for every web integration: the embed (launcher, panel or inline), end-user identity linking with a server-signed token, the `busymate-ai-v1` bridge pinned to [wire contract v1](CONTRACT-v1.md), typed events with link-status reason codes, and CSP and iframe guidance.

busymate.ai keeps serving the hosted chat and updates it every day. This SDK pins the page side of the wire, so those updates never change what your page sends or accepts. The plain snippet keeps working; [migration](docs/migration.md) shows how to move.

- TypeScript, typed, **zero runtime dependencies**.
- ESM and CommonJS for bundlers, plus a script-tag build (`dist/busymate-ai-web.iife.js`, ~10 KB gzipped) that defines `window.BusymateAIWeb`.
- **SSR-safe**: importing and creating a chat touches no DOM; `mount()` does nothing outside a browser.

## Install from the GitHub release

```sh
npm install @busymate/ai-web
```

Or install the packed tarball attached to the [0.2.0 release](https://github.com/serebano/busymate-ai-sdk-web/releases/tag/0.2.0):

```sh
npm install https://github.com/serebano/busymate-ai-sdk-web/releases/download/0.2.0/busymate-ai-web-0.2.0.tgz
```

Script tag: download `busymate-ai-web.iife.js` from the same release, serve it from your own origin (or CDN) and pin its SHA-256 with `integrity` (the hash is in the release notes):

```html
<script src="/vendor/busymate-ai-web-0.2.0.iife.js" integrity="sha256-…" crossorigin="anonymous"></script>
```

Or pin the git tag and build it (`dist/` is not committed):

```sh
git clone --branch 0.2.0 --depth 1 https://github.com/serebano/busymate-ai-sdk-web.git vendor/busymate-ai-sdk-web
(cd vendor/busymate-ai-sdk-web && npm ci && npm run build)
npm install ./vendor/busymate-ai-sdk-web
```

## Integrate

```ts
import { createBusymateChat, mintFromEndpoint } from "@busymate/ai-web";

const chat = createBusymateChat({
  assistant: "acme",                       // Console › Integration
  origin: "https://acme.busymate.ai",      // or your verified custom domain
  mode: "launcher",                        // "launcher" | "panel" | "inline"
  getIdentity: mintFromEndpoint("/api/bmai/identity"), // YOUR authenticated endpoint; null when signed out
});

chat.onLinkStatus((s) => console.debug("busymate link", s.state, s.reason));
chat.on("ready", ({ visitorKind }) => console.debug("chat ready as", visitorKind));
chat.mount();

// Wire YOUR auth events, not your router. Three calls, the same names as the script tag:
auth.onSignIn(() => chat.identityChanged());   // sign-in, token rotation, account switch
auth.onSignOut(() => chat.signedOut());        // never skip this one
// getIdentity (above) answers the chat; add `account: () => auth.userId ?? null` to catch a missed switch.
```

Script tag:

```html
<script src="/vendor/busymate-ai-web-0.2.0.iife.js"></script>
<script>
  const chat = BusymateAIWeb.createBusymateChat({ assistant: "acme" });
  chat.mount();
</script>
```

This SDK is the one web path. The `<script src=".../embed/v1.js">` snippet speaks the same names (`getIdentity`, `identityChanged()`, `signedOut()`, `account`); the older spellings (`logout()`, `setUser(null)`, `switchAccount()`, `identify()`, `refreshIdentity()`) still work as aliases, generated from the [identity contract](https://busymate.ai/docs/identity), but are not the documented way. [Sign-in and identity](https://busymate.ai/docs/identity) is the single customer page for the whole flow.

1. Read [identity linking](docs/identity.md): your backend signs a one-time ES256 token; never put a key in the page.
2. Configure the [complete reference](docs/configuration.md) and [events](docs/events.md).
3. Apply the [CSP and iframe guidance](docs/csp.md).
4. Add your page's origin to Console › Integration › allowed origins. Otherwise the SDK reports `origin_not_allowed`.

## Run the examples

```sh
npm ci && npm run build
node example-app/server.mjs                         # plain HTML: http://localhost:5180/example-app/plain/
cd example-app/react && npm install && npm run dev  # React: http://localhost:5181/
```

The [examples](example-app/README.md) consume this package (no copied SDK code). The plain page configures the assistant, origin, mode, locale, theme and your mint endpoint, drives every call and logs every event. Use a test workspace that allows `http://localhost:5180`.

## Build, test and versions

```sh
python3 scripts/verify-release.py
npm ci
npm run build && npm run check:dist && npm run typecheck && npm run lint && npm test
```

CI (`sdk-check`) runs that on Ubuntu, macOS and Windows (the unit tests drive the pinned wire against a stand-in frame), packs the tarball, installs it into the React example and builds it, and checks that the ESM, CommonJS and script-tag builds load without a DOM and export the same API. The release notes record the live check against the hosted chat. CI does not certify your backend's token signing or your workspace's allowed origins.

Distribution 0.2.0 speaks wire contract v1 (bridge `busymate-ai-v1`, identity `busymate.identity/v1`). The version is 0.x, not 1.0.0 like the native SDKs, because the link-status reason vocabulary reported by the hosted chat (busymate-ai-src#2069) is not settled yet; the wire itself is stable, and 1.0.0 follows once those codes land. The [release manifest](release-manifest.json) pins the contract and wire source hashes. This repository is canonical for web SDK releases; [busymate.ai documentation](https://busymate.ai/docs/guides/web-sdk) owns the human integration guide. See the [changelog](CHANGELOG.md) and [wire contract](CONTRACT-v1.md).
