/** The SDK's stylesheet, scoped to its own layer. One `<style>` per mounted chat. */
export function chatStyles(scope: string): string {
  const s = `[data-bmai-web="${scope}"]`;
  return [
    `${s}{--bmai-inset-x:16px;--bmai-inset-y:16px;position:fixed;right:var(--bmai-inset-x);bottom:calc(var(--bmai-inset-y) + env(safe-area-inset-bottom,0px));z-index:2147483000;font-family:ui-sans-serif,system-ui,sans-serif}`,
    `${s}[data-side=left]{right:auto;left:var(--bmai-inset-x)}`,
    `${s}>button{position:relative;border:0;border-radius:999px;background:#111827;color:#fff;padding:13px 18px;font:600 14px/1.2 ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 30px #0003;cursor:pointer}`,
    `${s}>button:focus-visible{outline:2px solid #2563eb;outline-offset:3px}`,
    `${s}[data-open]>button{display:none}`,
    `${s}>div{position:absolute;right:0;bottom:58px;width:min(420px,calc(100vw - 24px));height:min(720px,calc(100vh - 96px));overflow:hidden;border:1px solid #ffffff22;border-radius:16px;background:#111;box-shadow:0 18px 60px #0005}`,
    `${s}[data-side=left]>div{right:auto;left:0}`,
    `${s}[data-open]>div,${s}[data-mode=panel]>div{bottom:0}`,
    `${s} iframe{display:block;width:100%;height:100%;border:0;background:#111}`,
    `@media(max-width:639.98px){${s}{--bmai-inset-x:12px;--bmai-inset-y:12px}}`,
    `@media(max-width:520px){${s}>div{position:fixed;inset:0;width:100vw;height:100dvh;border:0;border-radius:0}}`,
    `[data-bmai-web-inline="${scope}"]{display:block;width:100%;height:100%;border:0}`,
  ].join("");
}
