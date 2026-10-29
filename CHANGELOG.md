# Changelog

## 0.1.1

- Release through npm trusted publishing (GitHub OIDC) only; `release.yml` no longer reads an `NPM_TOKEN` secret. CI derives the packed tarball name from `package.json`. No SDK code or wire change from 0.1.0.

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
