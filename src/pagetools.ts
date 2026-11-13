import type { PageTool, PageToolsHandle } from "./types.js";

/** The page-tools runtime the chat origin serves (`/sdk/v1/webmcp/index.js`). Loaded once, on first use. */
export interface PageToolsRuntime {
  registerPageTools(tools: readonly PageTool[], options: { exposedTo: readonly string[]; signal?: AbortSignal }): Promise<PageToolsHandle>;
  unregisterPageTools(names?: readonly string[]): Promise<void> | void;
  registerDeclarativeForms(options: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export const PAGE_TOOLS_PATH = "/sdk/v1/webmcp/index.js";

/** Never at import or mount time: only when the page first registers a tool. Rejects outside a browser. */
export async function loadPageTools(origin: string): Promise<PageToolsRuntime> {
  if (typeof document === "undefined") throw new Error("[busymate-ai-web] page tools need a browser");
  const url = origin + PAGE_TOOLS_PATH;
  try {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = url;
    document.head.appendChild(link);
  } catch {
    // the hint is best effort; import() below works without it
  }
  return (await import(/* @vite-ignore */ url)) as PageToolsRuntime;
}
