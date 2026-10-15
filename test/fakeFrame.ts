import { vi } from "vitest";
import type { BusymateChat } from "../src/index.js";

export const ORIGIN = "https://acme.busymate.ai";

export interface FakeFrame {
  iframe: HTMLIFrameElement;
  /** Everything the SDK posted to the frame, as `[message, targetOrigin]`. */
  posts: Array<[Record<string, unknown>, string]>;
  /** Messages of one type the SDK posted. */
  sent(type: string): Record<string, unknown>[];
  /** Post a frame → host message as the hosted chat would. */
  say(data: Record<string, unknown>, from?: { origin?: string; source?: unknown }): void;
}

/** Attach a fake hosted chat to the chat's iframe: captures host → frame posts, delivers frame → host messages. */
export function fakeFrame(): FakeFrame {
  const iframe = document.querySelector("iframe") as HTMLIFrameElement;
  if (!iframe) throw new Error("no iframe mounted");
  const posts: Array<[Record<string, unknown>, string]> = [];
  // The hosted chat is never loaded in unit tests: the iframe's window is a stand-in.
  const win = {
    postMessage: vi.fn((message: unknown, targetOrigin: unknown) => {
      posts.push([message as Record<string, unknown>, String(targetOrigin)]);
    }),
  };
  Object.defineProperty(iframe, "contentWindow", { configurable: true, get: () => win });
  return {
    iframe,
    posts,
    sent: (type) => posts.filter(([m]) => m.type === type).map(([m]) => m),
    say(data, from = {}) {
      const event = new Event("message");
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: from.origin ?? ORIGIN },
        source: { value: from.source ?? win },
      });
      window.dispatchEvent(event);
    },
  };
}

/** Let queued promise callbacks run. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

export function cleanup(chat: BusymateChat | null): void {
  chat?.unmount();
  document.body.innerHTML = "";
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignored
  }
}
