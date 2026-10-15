# SDK repository ownership

This repository owns the official web SDK (`@busymate/ai-web`): source, examples, packaging, CI and versioned releases.
Use an isolated named worktree/task branch. Preserve all existing lanes and changes. Land through protected PRs with `sdk-check` required; the initial 0.1.0 commit was the only direct push to `main`. No admin bypass.
Never modify an existing release or tag, `CONTRACT-v1.md`, `contract.json` or `src/wire.ts` in a shipped version. New bytes require a new SDK version; a breaking wire change requires `CONTRACT-v2.md` and a new major.
The private product repository (`busymate-ai-src`) owns the hosted chat, the frame side of the wire and the served loader (`/embed/v1.js`). busymate.ai publishes the human integration guide (`/docs/guides/web-sdk`) and may mirror versioned artifacts; hashes must match this repository's release.
Only SDK source intended for customer distribution belongs here. No production keys, signing code for tenants, backend implementation or tenant credentials. Examples run as guests unless given the integrator's own mint endpoint.
Zero runtime dependencies. Nothing may touch `window`/`document` at import time (SSR). Every postMessage is pinned to the frame's window and exact origin, never `*`.
Link-status `reason` codes are a stable, additive vocabulary: never rename or remove one; codes reported by the hosted chat are owned by busymate-ai-src (#2069).
Before push run `python3 scripts/verify-release.py` and `npm run check`. Publish a versioned GitHub release (tag, `npm pack` tarball, iife file and SHA-256) only after a green `sdk-check` on `main`. Do not publish to the npm registry.
