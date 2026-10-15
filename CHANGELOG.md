# Changelog

## Unreleased

- The plain example reads its settings from the URL (`?assistant=&origin=&mode=&locale=&theme=&mint=`), so a farm phone can open a preconfigured link. The examples are also published at https://serebano.github.io/busymate-ai-sdk-web/ (built from `main`).
- Farm-phone check, 2026-10-15, on the Busymate AI test workspace `demos`: iOS Safari (iPhone, iOS 26.5) passes launcher open/close, keyboard with the composer visible, `ask()` (plain and React) and link status; one cosmetic gap above the keyboard. Android Chrome (Pixel 4a): the page and launcher load; the interactive checks are pending a free farm Pixel with Chrome. Results and screenshots: `example-app/farm-checks/2026-10-15.md`.

## 0.1.0

First independent web distribution, `@busymate/ai-web`, speaking wire contract v1 (bridge `busymate-ai-v1`, channel `embed`, identity `busymate.identity/v1`; see `CONTRACT-v1.md` and `contract.json`).

- `createBusymateChat()`: mount and unmount the hosted chat as a floating launcher, a launcher-less panel, or inline in your container. Same frame URL, iframe sandbox and permissions as the hosted loader, same first-party visitor keys, so a site moving from the snippet keeps its visitors.
- Identity linking: `getIdentity` provider (or `mintFromEndpoint()` for the standard `POST { nonce, returnTo }` endpoint), `identify`/`setUser`, `identityChanged`, `logout`, `switchAccount`, `account()` change detection, the in-chat sign-in handoff and its return fragment.
- Link status with stable `reason` codes (`onLinkStatus`, `linkStatus` event): `identified`, `not_signed_in`, `mint_failed`, `mint_timeout`, `invalid_identity`, `nonce_mismatch`, `not_verified`, `origin_not_allowed`, the revoke reasons, and pass-through of codes the hosted chat reports in `busymate.identity.v1.ack` (busymate-ai-src#2069).
- Typed events: `ready`, `open`, `close`, `message`, `linkStatus`, `navigate`, `signInRequest`, `sessionEnded`, `error`.
- Commands: `open`, `close`, `toggle`, `ask`, `setTheme`, `setLocale`, `releaseConsent`, queued until the chat proves it listens.
- Embed preflight (`/api/embed-status`) that names a missing allowed origin.
- CSP helpers (`cspDirectives`, `cspHeader`) and the pinned `IFRAME_POLICY`.
- ESM + CommonJS + script-tag (IIFE, `window.BusymateAIWeb`) builds with types; zero runtime dependencies; SSR-safe import.
- Examples: plain HTML on the script-tag build, minimal React on the ESM build.

Not in 0.1.0 (use the snippet on pages that need them): the floating picture-in-picture window, page tools (`registerPageTools`), the `data-layout="push"` page reflow, the Console launcher look script, and page-language reporting.
