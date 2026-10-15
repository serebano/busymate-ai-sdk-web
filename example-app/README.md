# Web SDK example apps

Two examples consume the SDK in this repository (no copied or mock SDK code):

- `plain/`: one HTML page on the **script-tag build** (`dist/busymate-ai-web.iife.js`). Its settings change the assistant, serving origin, mode (launcher, panel, inline), locale, theme and your mint endpoint, and it drives every call (`open`, `close`, `toggle`, `ask`, `identityChanged`, `logout`, `switchAccount`) and logs every event, including `linkStatus`.
- `react/`: a minimal React app (Vite) on the **ESM build** (`@busymate/ai-web` from `file:../..`): a `useBusymateChat` hook that mounts in an effect, plus sign-in, switch and sign-out buttons wired to `identityChanged()` and `logout()`.

## Run

From the repository root:

```sh
npm ci && npm run build
node example-app/server.mjs                # plain: http://localhost:5180/example-app/plain/
cd example-app/react && npm install && npm run dev   # react: http://localhost:5181/
```

## Allowed origins

The hosted chat frames only on origins your workspace allows. Use a **test
workspace**: add `http://localhost:5180` (and `http://localhost:5181`) to
Console › Integration › allowed origins. Otherwise the SDK reports
`error: origin_not_allowed` and link status `failed · origin_not_allowed`;
that is the preflight working, not a bug.

The default assistant `busyproxy` is the platform's public guest assistant: it
works anonymously but does not allow localhost. Pass your own test assistant
(`?assistant=` in the React example, the Assistant field in the plain one).

## Identified mode

Both examples are guests until you give them **your** authenticated mint
endpoint (`POST { nonce, returnTo }` → `{ token, nonce }`). The examples never
sign anything and ship no keys; see [identity](../docs/identity.md) and
<https://busymate.ai/docs/guides/identity-backend-signing>.
