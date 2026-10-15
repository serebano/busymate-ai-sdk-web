# Content Security Policy and the iframe

## What the SDK loads

- **One iframe** on the assistant's serving origin (`https://<assistant>.busymate.ai` or your custom AI domain).
- **One `fetch`** to that origin's `/api/embed-status` (the preflight; disable with `preflight: false`).
- **One `<style>` element**, scoped to the SDK's own elements.
- **Your** mint endpoint, through your provider.
- **No remote script.** Everything else is in the package.

## Directives to add

Merge these into your policy; do not replace it:

```
frame-src   https://acme.busymate.ai
connect-src https://acme.busymate.ai [your mint endpoint's origin, when it is not 'self']
style-src   'nonce-…'   (pass the same value as createBusymateChat({ nonce }))  — or 'self' 'unsafe-inline' if your policy already allows it
script-src  [where you serve busymate-ai-web.iife.js, when it is not 'self']
```

Or compute them:

```ts
import { cspHeader } from "@busymate/ai-web";
cspHeader({ origin: "https://acme.busymate.ai", mintOrigin: "https://api.acme.com" });
// "frame-src https://acme.busymate.ai; connect-src https://acme.busymate.ai https://api.acme.com"
```

If your page sends `Permissions-Policy`, do not block `microphone` (and `autoplay`) for the chat origin if your assistant offers voice: `Permissions-Policy: microphone=(self "https://acme.busymate.ai")`.

## The iframe

The SDK sets, and you should not change:

| Attribute | Value | Why |
|---|---|---|
| `sandbox` | `allow-scripts allow-forms allow-same-origin` | The chat is an app on its own origin: it needs scripts, forms and its own storage. No `allow-top-navigation` and no `allow-popups`: links and sign-in go through the pinned bridge, which your page (the SDK) checks. |
| `allow` | `tools; microphone; autoplay` | Voice (microphone, audio playback) and WebMCP page tools, delegated to the chat origin only. |
| `referrerpolicy` | `strict-origin-when-cross-origin` | The chat learns your origin, never your full URL. |

The frame URL carries the visitor token and any launch assertion in the **fragment**, which browsers never send in a request, a `Referer` or an access log.

## The other direction: who may frame the chat

The hosted chat sends `frame-ancestors` from your workspace's **allowed origins** (Console › Integration). A page that is not listed sees the browser refuse the frame. The SDK's preflight asks first and reports `origin_not_allowed` instead of showing a broken panel. List every origin that mounts the chat, exactly (`https://www.acme.com` and `https://acme.com` are different).

## Messages

Every message is pinned both ways: the SDK reads only messages whose `source` is its own iframe and whose `origin` is the exact chat origin, and posts only to that iframe with that exact `targetOrigin` (never `*`). The chat checks that the sender is its parent and that the parent's origin is allowed.
