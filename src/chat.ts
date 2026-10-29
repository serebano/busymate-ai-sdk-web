import { Emitter } from "./emitter.js";
import { hasDom, safeGet, safeSet, randomId } from "./env.js";
import { IdentityLink, DEFAULT_IDENTITY_BUDGET_MS } from "./identity.js";
import { defaultOrigin, parseExactOrigin } from "./origins.js";
import { chatStyles } from "./styles.js";
import { SDK_VERSION } from "./version.js";
import { loadPageTools, type PageToolsRuntime } from "./pagetools.js";
import { VisitorToken, consumeReturnIdentity } from "./visitor.js";
import {
  ASSISTANT_SLUG,
  BRIDGE_MARKER,
  CONTRACT_VERSION,
  EMBED_CHANNEL,
  FRAGMENT,
  FRAME_MESSAGE,
  FRAME_PATH_PREFIX,
  HOST_MESSAGE,
  IDENTITY_ASK_REASONS,
  IFRAME_ALLOW,
  IFRAME_REFERRER_POLICY,
  IFRAME_SANDBOX,
  LOCALE_TAG,
  THEMES,
  isFrameMessageType,
  openStateKey,
  panelSizeKey,
  type IdentityAskReason,
  type RevokeReason,
  type Theme,
} from "./wire.js";
import type {
  AskOptions,
  BusymateChat,
  BusymateChatEventName,
  BusymateChatEvents,
  BusymateChatOptions,
  BusymateIdentity,
  ChatMode,
  IdentityProvider,
  LinkStatus,
  OpenSource,
} from "./types.js";

type Message = Record<string, unknown> & { type: string };

/** Host → frame commands queued before the frame proves it listens (`ready`). */
const QUEUE_MAX = 8;
/** An open frame that has said nothing for this long is checked again. */
const FRAME_SILENT_MS = 12_000;
/** Panels are resizable above this width; at or below 520 px the panel is full-screen. */
const RESIZE_MOBILE_MAX = 640;
const FULLSCREEN_MAX = 520;
const RESIZE_MIN_W = 360;
const RESIZE_MIN_H = 480;
const RESIZE_VIEWPORT_FRACTION = 0.92;
const KEYBOARD_MIN_PX = 80;

let scopeSeq = 0;

function accessibleName(visible: string, descriptive?: string): string {
  if (descriptive && descriptive.toLowerCase().includes(visible.toLowerCase())) return descriptive;
  return descriptive ? `${visible} — ${descriptive}` : visible;
}

function resolveContainer(container: HTMLElement | string | undefined): HTMLElement | null {
  if (!container) return null;
  if (typeof container === "string") return document.querySelector<HTMLElement>(container);
  return container;
}

/**
 * Create a Busymate AI chat for this page. Nothing touches the DOM until
 * `mount()`; creating one during server rendering is safe.
 */
export function createBusymateChat(options: BusymateChatOptions): BusymateChat {
  if (!options || typeof options.assistant !== "string" || !ASSISTANT_SLUG.test(options.assistant)) {
    throw new TypeError("createBusymateChat: `assistant` must be your assistant slug (lowercase letters, digits and dashes)");
  }
  const assistant = options.assistant;
  const origin = parseExactOrigin(options.origin ?? defaultOrigin(assistant));
  if (!origin) throw new TypeError("createBusymateChat: `origin` must be an exact https origin, for example https://acme.busymate.ai");
  const mode: ChatMode = options.mode ?? "launcher";
  if (mode !== "launcher" && mode !== "panel" && mode !== "inline") throw new TypeError("createBusymateChat: `mode` is launcher, panel or inline");
  if (options.locale !== undefined && !LOCALE_TAG.test(options.locale)) throw new TypeError("createBusymateChat: `locale` must be a BCP 47 tag");
  if (options.theme !== undefined && !(THEMES as readonly string[]).includes(options.theme)) throw new TypeError("createBusymateChat: `theme` is light, dark or system");

  const emitter = new Emitter<BusymateChatEvents>();
  const scope = `c${++scopeSeq}`;
  const label = options.launcher?.label || "Ask AI";
  const ariaLabel = accessibleName(label, options.launcher?.ariaLabel || "Open AI experience");
  const side = options.launcher?.side === "left" ? "left" : "right";
  const preflight = options.preflight !== false;
  const floating = mode !== "inline";

  // ── state ────────────────────────────────────────────────────────────────
  let mounted = false;
  let open = mode === "inline";
  let consentPending = options.consent === "wait";
  let visitor: VisitorToken | null = null;
  let layer: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let button: HTMLButtonElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let style: HTMLStyleElement | null = null;
  let currentFrameUrl: URL | null = null;
  let iframeLoaded = false;
  let wiresReady = false;
  let frameSpoke = false;
  let frameChecked: boolean | null = null;
  let silentTimer: ReturnType<typeof setTimeout> | null = null;
  let queue: Message[] = [];
  let lastThemePin: Message | null = options.theme ? { type: HOST_MESSAGE.theme, theme: options.theme } : null;
  let lastLocalePin: Message | null = null;
  let postedKeyboardInset = -1;
  const cleanups: Array<() => void> = [];

  const link = new IdentityLink({
    provider: options.getIdentity ?? null,
    account: options.account ?? null,
    budgetMs: options.identityBudgetMs ?? DEFAULT_IDENTITY_BUDGET_MS,
    launchIdentity: null,
    reply: (message) => postNow(message),
    send: (message) => postToFrame(message),
    onStatus: (status) => emitter.emit("linkStatus", status),
  });

  // ── wire ─────────────────────────────────────────────────────────────────
  function postNow(message: Message): void {
    const target = iframe?.contentWindow;
    if (target) target.postMessage(message, origin!);
  }

  /** Every host → frame command takes this one seam: now when the frame listens, else queued. */
  function postToFrame(message: Message): void {
    if (wiresReady && iframe?.contentWindow) {
      iframe.contentWindow.postMessage(message, origin!);
      return;
    }
    queue.push(message);
    if (queue.length > QUEUE_MAX) queue.shift();
  }

  function flushQueue(): void {
    wiresReady = true;
    const pending = queue;
    queue = [];
    for (const message of pending) postNow(message);
  }

  function buildFrameUrl(identity: BusymateIdentity | null, fresh: boolean): URL {
    const url = new URL(FRAME_PATH_PREFIX + encodeURIComponent(assistant), origin!);
    url.searchParams.set("channel", EMBED_CHANNEL);
    url.searchParams.set("bridge", BRIDGE_MARKER);
    // This runs IN the host page: `location.origin` is the one fact a foreign framer cannot spoof.
    url.searchParams.set("host", location.origin);
    url.searchParams.set("page", location.pathname);
    if (options.locale) url.searchParams.set("locale", options.locale);
    if (fresh) url.searchParams.set("instance", randomId(9));
    const fragment = new URLSearchParams();
    if (visitor) fragment.set(FRAGMENT.visitor, visitor.value);
    if (identity) {
      fragment.set(FRAGMENT.token, identity.token);
      fragment.set(FRAGMENT.nonce, identity.nonce);
    }
    const encoded = fragment.toString();
    if (encoded) url.hash = encoded;
    return url;
  }

  function loadFrame(identity: BusymateIdentity | null, fresh: boolean): void {
    if (!iframe) return;
    const url = buildFrameUrl(identity, fresh);
    currentFrameUrl = url;
    iframeLoaded = false;
    wiresReady = false;
    frameSpoke = false;
    iframe.src = url.href;
  }

  function publishPins(): void {
    if (lastThemePin) postToFrame(lastThemePin);
    if (lastLocalePin) postToFrame(lastLocalePin);
  }

  // ── panel geometry ───────────────────────────────────────────────────────
  function panelBounds(): { minW: number; minH: number; maxW: number; maxH: number } {
    const maxW = Math.min(window.innerWidth - 24, window.innerWidth * RESIZE_VIEWPORT_FRACTION);
    const maxH = Math.min(window.innerHeight - 96, window.innerHeight * RESIZE_VIEWPORT_FRACTION);
    return { minW: RESIZE_MIN_W, minH: RESIZE_MIN_H, maxW, maxH };
  }

  function resizable(): boolean {
    return floating && window.innerWidth > RESIZE_MOBILE_MAX;
  }

  function publishResizable(): void {
    if (!iframeLoaded || !iframe?.contentWindow) return;
    const b = panelBounds();
    postNow({ type: HOST_MESSAGE.resizable, resizable: resizable(), minW: b.minW, minH: b.minH, maxW: Math.round(b.maxW), maxH: Math.round(b.maxH), side });
  }

  function applyPanelSize(w: number, h: number, persist: boolean): void {
    if (!panel || !resizable()) return;
    const b = panelBounds();
    const width = Math.max(b.minW, Math.min(w, b.maxW));
    const height = Math.max(b.minH, Math.min(h, b.maxH));
    panel.style.width = Math.round(width) + "px";
    panel.style.height = Math.round(height) + "px";
    if (persist) safeSet(() => localStorage, panelSizeKey(assistant), JSON.stringify({ w: width, h: height }));
  }

  function restorePanelSize(): void {
    if (!panel || !floating) return;
    if (!resizable()) {
      panel.style.removeProperty("width");
      panel.style.removeProperty("height");
      publishResizable();
      return;
    }
    const raw = safeGet(() => localStorage, panelSizeKey(assistant));
    if (raw) {
      try {
        const size = JSON.parse(raw) as { w?: unknown; h?: unknown };
        if (typeof size.w === "number" && typeof size.h === "number" && isFinite(size.w) && isFinite(size.h)) applyPanelSize(size.w, size.h, false);
      } catch {
        // a corrupt stored size is ignored
      }
    }
    publishResizable();
  }

  function postKeyboardInset(px: number): void {
    const value = Math.max(0, Math.round(px) || 0);
    if (value === postedKeyboardInset) return;
    postedKeyboardInset = value;
    if (iframeLoaded) postNow({ type: HOST_MESSAGE.keyboard, inset: value });
  }

  /** On a phone the full-screen panel follows the visual viewport, so the composer stays above the keyboard. */
  function fitVisualViewport(): void {
    const vv = window.visualViewport;
    if (!vv || !panel || !floating) return;
    const keyboard = window.innerHeight - vv.height;
    if (!open || window.innerWidth > FULLSCREEN_MAX || keyboard < KEYBOARD_MIN_PX) {
      panel.style.removeProperty("top");
      panel.style.removeProperty("height");
      postKeyboardInset(0);
      return;
    }
    panel.style.top = Math.round(vv.offsetTop) + "px";
    panel.style.height = Math.round(vv.height) + "px";
    postKeyboardInset(0);
  }

  // ── open state ───────────────────────────────────────────────────────────
  let lastPublishedOpen: boolean | null = null;
  function publishOpen(next: boolean): void {
    if (!floating || next === lastPublishedOpen) return;
    lastPublishedOpen = next;
    try {
      document.documentElement.setAttribute("data-bmai-chat", next ? "open" : "closed");
      window.dispatchEvent(new CustomEvent(next ? "bmai:chat-open" : "bmai:chat-close", { detail: { assistant, reserved: 0 } }));
    } catch {
      // very old engines: the attribute is enough
    }
  }

  function setOpen(next: boolean, source: OpenSource): void {
    if (!mounted || !floating) {
      if (mode === "inline" && !next && source === "frame") emitter.emit("close", { source });
      return;
    }
    if (next === open) return;
    open = next;
    if (next && !consentPending) visitor?.persist();
    if (panel) panel.hidden = !next;
    if (layer) {
      if (next) layer.setAttribute("data-open", "");
      else layer.removeAttribute("data-open");
    }
    button?.setAttribute("aria-expanded", next ? "true" : "false");
    safeSet(() => sessionStorage, openStateKey(assistant), next ? "1" : null);
    fitVisualViewport();
    publishOpen(next);
    if (next) {
      try {
        iframe?.focus();
      } catch {
        // focus is best-effort
      }
      watchFrame();
    } else if (source === "frame" || source === "escape") {
      try {
        button?.focus();
      } catch {
        // focus is best-effort
      }
    }
    emitter.emit(next ? "open" : "close", { source });
  }

  // ── embed preflight and the silent-frame watchdog ────────────────────────
  function checkFrameable(done: (ok: boolean | null) => void): void {
    if (typeof fetch !== "function") return done(null);
    const chain = [location.origin];
    try {
      const ancestors = location.ancestorOrigins;
      for (let i = 0; ancestors && i < ancestors.length; i++) chain.push(ancestors[i]!);
    } catch {
      // ancestorOrigins is Chromium/WebKit only
    }
    const url = `${origin}/api/embed-status?assistant=${encodeURIComponent(assistant)}&ancestors=${encodeURIComponent(chain.join(","))}`;
    fetch(url, { cache: "no-store", credentials: "omit" })
      .then((r) => (r.ok ? (r.json() as Promise<{ frameable?: unknown }>) : null))
      .then(
        (body) => done(body && typeof body.frameable === "boolean" ? body.frameable : null),
        () => done(null),
      );
  }

  function reportRefused(): void {
    link.originRefused();
    emitter.emit("error", {
      code: "origin_not_allowed",
      message: `${location.origin} is not an allowed embed origin for "${assistant}". Add it in Console › Integration (allowed origins).`,
    });
  }

  function watchFrame(): void {
    if (!preflight) return;
    if (frameChecked === null) {
      frameChecked = false;
      checkFrameable((ok) => {
        frameChecked = ok !== false;
        if (ok === false) reportRefused();
      });
    }
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = setTimeout(() => {
      silentTimer = null;
      if (frameSpoke || !mounted || (floating && !open)) return;
      emitter.emit("error", { code: "frame_silent", message: `The chat frame has not answered for ${FRAME_SILENT_MS / 1000} s.` });
    }, FRAME_SILENT_MS);
  }

  // ── frame → host ─────────────────────────────────────────────────────────
  function defaultSignIn(url: string): void {
    try {
      const auth = new URL(url);
      if (auth.protocol !== "https:") return;
      const returnTo = new URL(location.href);
      returnTo.hash = "";
      auth.searchParams.set("return_to", returnTo.href);
      location.assign(auth.href);
    } catch {
      // a malformed URL is ignored
    }
  }

  function defaultNavigate(url: URL): void {
    if (url.href === location.href) return;
    let observed = false;
    let observer: MutationObserver | null = null;
    const titleBefore = document.title;
    try {
      observer = new MutationObserver(() => {
        observed = true;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch {
      observer = null;
    }
    try {
      history.pushState(history.state, "", url.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      window.dispatchEvent(new CustomEvent("busymate:hostnavigate", { detail: { href: url.href } }));
    } catch {
      observer?.disconnect();
      location.assign(url.href);
      return;
    }
    // A page whose router did not react gets a normal navigation.
    setTimeout(() => {
      observer?.disconnect();
      if (!observed && document.title === titleBefore) location.assign(url.href);
    }, 300);
  }

  function onNavigate(href: unknown): void {
    if (typeof href !== "string") return;
    let url: URL;
    try {
      url = new URL(href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    emitter.emit("navigate", { href: url.href });
    if (floating && window.innerWidth <= FULLSCREEN_MAX) setOpen(false, "navigate");
    if (options.onNavigate && options.onNavigate(url.href) === true) return;
    defaultNavigate(url);
  }

  function onMessage(event: MessageEvent): void {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    frameSpoke = true;
    const type = data.type;
    if (type.startsWith("busymate.") || isFrameMessageType(type)) emitter.emit("message", { type, data });
    switch (type) {
      case FRAME_MESSAGE.ready: {
        flushQueue();
        const visitorKind = typeof data.visitorKind === "string" ? data.visitorKind : "anonymous";
        const displayClaims = data.displayClaims && typeof data.displayClaims === "object" ? (data.displayClaims as Record<string, unknown>) : undefined;
        link.ready(visitorKind);
        emitter.emit("ready", displayClaims ? { visitorKind, displayClaims } : { visitorKind });
        return;
      }
      case FRAME_MESSAGE.resizableRequest:
        flushQueue();
        iframeLoaded = true;
        publishResizable();
        return;
      case FRAME_MESSAGE.close:
        setOpen(false, "frame");
        return;
      case FRAME_MESSAGE.openUrl: {
        try {
          const url = new URL(String(data.url));
          if (url.protocol === "https:" || url.protocol === "http:") window.open(url.href, "_blank", "noopener,noreferrer");
        } catch {
          // ignored
        }
        return;
      }
      case FRAME_MESSAGE.navigate:
        onNavigate(data.href);
        return;
      case FRAME_MESSAGE.authRequest: {
        const url = typeof data.url === "string" ? data.url : "";
        if (!url) return;
        emitter.emit("signInRequest", { url });
        if (options.onSignInRequest && options.onSignInRequest(url) === true) return;
        defaultSignIn(url);
        return;
      }
      case FRAME_MESSAGE.identityRequest: {
        const reason = (IDENTITY_ASK_REASONS as readonly string[]).includes(String(data.reason)) ? (data.reason as IdentityAskReason) : "launch";
        const deadlineAt = typeof data.deadlineAt === "number" ? data.deadlineAt : undefined;
        void link.answerAsk(reason, deadlineAt);
        return;
      }
      case FRAME_MESSAGE.identityAck:
        link.ack(data.outcome);
        return;
      case FRAME_MESSAGE.resizeTo:
        if (typeof data.w === "number" && typeof data.h === "number") applyPanelSize(data.w, data.h, false);
        return;
      case FRAME_MESSAGE.resizeBy:
        if (panel && typeof data.dw === "number" && typeof data.dh === "number") applyPanelSize(panel.clientWidth + data.dw, panel.clientHeight + data.dh, true);
        return;
      case FRAME_MESSAGE.resizeEnd:
        if (panel && resizable()) safeSet(() => localStorage, panelSizeKey(assistant), JSON.stringify({ w: panel.clientWidth, h: panel.clientHeight }));
        return;
      case FRAME_MESSAGE.sessionEnded:
        emitter.emit("sessionEnded", typeof data.sessionId === "string" ? { sessionId: data.sessionId } : {});
        return;
      case FRAME_MESSAGE.pipPrepare:
        // The floating window needs the hosted loader's helper; this SDK version declines it.
        postNow({ type: HOST_MESSAGE.pipReady, ok: false, reason: "blocked" });
        return;
      default:
        return;
    }
  }

  // ── mount / unmount ──────────────────────────────────────────────────────
  function listen<K extends keyof WindowEventMap>(target: Window | Document | VisualViewport, name: K | string, fn: (event: never) => void): void {
    target.addEventListener(name, fn as EventListener);
    cleanups.push(() => target.removeEventListener(name, fn as EventListener));
  }

  function mount(): boolean {
    if (mounted || !hasDom()) return false;
    const host = resolveContainer(options.container);
    if (mode === "inline" && !host) {
      emitter.emit("error", { code: "invalid_option", message: "inline mode needs a `container` element" });
      return false;
    }
    if (!document.body) return false;
    mounted = true;
    visitor = new VisitorToken(assistant);
    const returned = consumeReturnIdentity();

    style = document.createElement("style");
    if (options.nonce) style.nonce = options.nonce;
    style.textContent = chatStyles(scope);
    document.head.appendChild(style);

    iframe = document.createElement("iframe");
    iframe.title = options.title || label;
    iframe.allow = IFRAME_ALLOW;
    iframe.setAttribute("sandbox", IFRAME_SANDBOX);
    iframe.referrerPolicy = IFRAME_REFERRER_POLICY;
    iframe.loading = floating ? "lazy" : "eager";
    iframe.addEventListener("load", () => {
      iframeLoaded = true;
      publishResizable();
      if (postedKeyboardInset > 0) postNow({ type: HOST_MESSAGE.keyboard, inset: postedKeyboardInset });
    });

    if (floating) {
      layer = document.createElement("div");
      layer.setAttribute("data-bmai-web", scope);
      layer.setAttribute("data-mode", mode);
      layer.setAttribute("data-side", side);
      panel = document.createElement("div");
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", ariaLabel);
      panel.appendChild(iframe);
      layer.appendChild(panel);
      if (mode === "launcher") {
        button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-label", ariaLabel);
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => setOpen(!open, "launcher"));
        layer.appendChild(button);
      }
      (host ?? document.body).appendChild(layer);
      try {
        document.documentElement.setAttribute("data-bmai-chat", "closed");
      } catch {
        // ignored
      }
      lastPublishedOpen = false;
      listen(document, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape" && open) setOpen(false, "escape");
      });
      listen(window, "resize", () => restorePanelSize());
      if (window.visualViewport) {
        listen(window.visualViewport, "resize", () => fitVisualViewport());
        listen(window.visualViewport, "scroll", () => fitVisualViewport());
      }
    } else {
      iframe.setAttribute("data-bmai-web-inline", scope);
      host!.appendChild(iframe);
    }
    listen(window, "message", onMessage);

    if (returned) link.setLaunchIdentity(returned);
    link.frameReplaced();
    loadFrame(link.takeLaunchIdentity(), false);
    publishPins();
    restorePanelSize();

    const reopen = options.openOnMount ?? safeGet(() => sessionStorage, openStateKey(assistant)) === "1";
    if (mode === "inline") watchFrame();
    else if (reopen) setOpen(true, "restore");
    return true;
  }

  function unmount(): void {
    if (!mounted) return;
    if (floating && open) publishOpen(false);
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = null;
    layer?.remove();
    if (!floating) iframe?.remove();
    style?.remove();
    if (floating) {
      try {
        document.documentElement.removeAttribute("data-bmai-chat");
      } catch {
        // ignored
      }
    }
    layer = panel = button = null;
    iframe = null;
    style = null;
    currentFrameUrl = null;
    mounted = false;
    open = mode === "inline";
    lastPublishedOpen = null;
    wiresReady = iframeLoaded = frameSpoke = false;
    queue = [];
    postedKeyboardInset = -1;
    link.frameReplaced();
  }

  let pageToolsRuntime: Promise<PageToolsRuntime> | null = null;
  const pageTools = (): Promise<PageToolsRuntime> => (pageToolsRuntime ??= loadPageTools(origin));

  // ── public handle ────────────────────────────────────────────────────────
  const chat: BusymateChat = {
    version: SDK_VERSION,
    contractVersion: CONTRACT_VERSION,
    origin,
    assistant,
    mode,
    mount,
    unmount,
    get mounted() {
      return mounted;
    },
    open: () => setOpen(true, "api"),
    close: () => setOpen(false, "api"),
    toggle: () => setOpen(!open, "api"),
    isOpen: () => mounted && open,
    ask(text: string, askOptions?: AskOptions): boolean {
      if (typeof text !== "string" || !text.trim()) return false;
      setOpen(true, "api");
      const message: Message = { type: HOST_MESSAGE.ask, requestId: "ask-" + randomId(9), prompt: text };
      if (askOptions?.submit === false) message.submit = false;
      postToFrame(message);
      return true;
    },
    setTheme(theme: Theme): boolean {
      if (!(THEMES as readonly string[]).includes(theme)) return false;
      lastThemePin = { type: HOST_MESSAGE.theme, theme };
      postToFrame(lastThemePin);
      return true;
    },
    setLocale(locale: string | null): boolean {
      if (locale !== null && (typeof locale !== "string" || !LOCALE_TAG.test(locale))) return false;
      lastLocalePin = { type: HOST_MESSAGE.locale, locale };
      postToFrame(lastLocalePin);
      return true;
    },
    setIdentityProvider(provider: IdentityProvider | null, account?: (() => string | null | undefined) | null): void {
      link.setProvider(provider, account);
    },
    identify(identity: BusymateIdentity): boolean {
      // Before mount, the identity rides the frame URL's fragment at launch.
      return mounted ? link.identify(identity) : link.setLaunchIdentity(identity);
    },
    setUser(identity: BusymateIdentity | null): boolean {
      return identity === null ? link.logout("signed_out") : chat.identify(identity);
    },
    identityChanged: () => link.changed(),
    signedOut: (reason?: RevokeReason) => link.logout(reason),
    logout: (reason?: RevokeReason) => link.logout(reason),
    switchAccount: (next?: BusymateIdentity | null) => link.switchAccount(next),
    refreshIdentity: () => link.changed(),
    registerPageTools: (tools, toolOptions) =>
      pageTools().then((runtime) => runtime.registerPageTools(tools, { ...toolOptions, exposedTo: [...new Set([origin, "https://busymate.ai", ...(toolOptions?.exposedTo ?? [])])] })),
    unregisterPageTools: (names) => pageTools().then((runtime) => runtime.unregisterPageTools(names)),
    registerDeclarativeForms: (formOptions) => pageTools().then((runtime) => runtime.registerDeclarativeForms({ exposedTo: [origin, "https://busymate.ai"], ...formOptions })),
    get linkStatus(): LinkStatus {
      return link.status;
    },
    onLinkStatus(listener: (status: LinkStatus) => void): () => void {
      const off = emitter.on("linkStatus", listener);
      try {
        listener(link.status);
      } catch (error) {
        if (typeof console !== "undefined") console.error("[busymate-ai-web] linkStatus listener threw", error);
      }
      return off;
    },
    releaseConsent(): void {
      consentPending = false;
      visitor?.persist();
    },
    on<K extends BusymateChatEventName>(name: K, listener: (event: BusymateChatEvents[K]) => void): () => void {
      return emitter.on(name, listener);
    },
    off<K extends BusymateChatEventName>(name: K, listener: (event: BusymateChatEvents[K]) => void): void {
      emitter.off(name, listener);
    },
    frameUrl(): string | null {
      if (!currentFrameUrl) return null;
      const url = new URL(currentFrameUrl.href);
      url.hash = "";
      return url.href;
    },
  };

  return chat;
}
