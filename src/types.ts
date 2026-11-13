import type { IdentityAskReason, RevokeReason, Theme } from "./wire.js";

/** A one-time launch assertion from YOUR backend: an ES256 JWT and the nonce it carries. */
export interface BusymateIdentity {
  readonly token: string;
  readonly nonce: string;
}

/** What the SDK passes to your identity provider. */
export interface IdentityRequest {
  /** A fresh random nonce. Send it to your mint endpoint; it must come back in the token. */
  readonly nonce: string;
  /** Why the chat is asking (launch, resume, refresh…), or `changed` after `identityChanged()`. */
  readonly reason: IdentityAskReason | "changed" | "switch" | "handoff";
}

/**
 * Mint through YOUR authenticated backend. Return a FRESH pair on every call,
 * `null` when nobody is signed in, and throw (or reject) when the mint failed.
 */
export type IdentityProvider = (request: IdentityRequest) => BusymateIdentity | null | Promise<BusymateIdentity | null>;

/** A tool your page offers the assistant. `execute` runs in YOUR page, so credentials never reach the assistant. */
export interface PageTool {
  /** Lowercase letters, digits, `_` or `-`. The in-chat sign-in tool is named `sign_in`. */
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the arguments. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: { readonly readOnlyHint?: boolean } & Readonly<Record<string, unknown>>;
  execute(input: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface PageToolsOptions {
  /** Extra exact origins allowed to run these tools. The assistant's own origin and https://busymate.ai are always included. */
  readonly exposedTo?: readonly string[];
  /** Abort to unregister every tool this call registered. */
  readonly signal?: AbortSignal;
}

export interface PageToolsHandle {
  /** The names now live. */
  readonly tools: readonly string[];
  /** Tools of this call that failed validation (the rest are live). */
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
  readonly exposedTo: readonly string[];
  unregister(): void;
}

/** Where the chat is drawn. */
export type ChatMode = "launcher" | "panel" | "inline";

/** Which corner the launcher and panel dock to. */
export type DockSide = "right" | "left";

export interface LauncherOptions {
  /** Visible button text. Default "Ask AI". */
  readonly label?: string;
  /** Accessible name; the visible label is prefixed when it does not contain it. */
  readonly ariaLabel?: string;
  /** Corner. Default "right". */
  readonly side?: DockSide;
}

export interface BusymateChatOptions {
  /** Your assistant slug (Console › Integration). */
  readonly assistant: string;
  /**
   * The assistant's serving origin: your custom AI domain, or
   * `https://<assistant>.busymate.ai` (the default). Exact https origin only.
   */
  readonly origin?: string;
  /** Default "launcher": a floating button and panel. "panel": the panel only, opened from your UI. "inline": the chat fills `container`. */
  readonly mode?: ChatMode;
  /** Required for `inline`; for the other modes, the element the layer is appended to (default `document.body`). */
  readonly container?: HTMLElement | string;
  /** Launcher text and corner. */
  readonly launcher?: LauncherOptions;
  /** The iframe's accessible title. Default: the launcher label. */
  readonly title?: string;
  /** First-paint locale (BCP 47). Later changes: `setLocale()`. */
  readonly locale?: string;
  /** First-paint theme. Later changes: `setTheme()`. */
  readonly theme?: Theme;
  /** Identity provider; set or replace later with `setIdentityProvider()`. */
  readonly getIdentity?: IdentityProvider;
  /**
   * Optional: your page's authoritative signed-in account id (null = signed
   * out). Read in memory only, never sent anywhere. When it changes between
   * asks, the SDK withdraws the previous person's chat before answering.
   */
  readonly account?: () => string | null | undefined;
  /** "wait" holds the durable visitor cookie until `releaseConsent()`. */
  readonly consent?: "granted" | "wait";
  /** Default true: ask `/api/embed-status` on first open whether this page may frame the chat, and report `origin_not_allowed`. */
  readonly preflight?: boolean;
  /** Open on mount. Default: re-open when the panel was open on the previous page of this tab. */
  readonly openOnMount?: boolean;
  /**
   * In-chat "Sign in" asked to send the visitor to your login. Return true when
   * you handled it (for example, a login modal followed by `identityChanged()`).
   * Default: navigate this tab to the https login URL with `return_to` set to this page.
   */
  readonly onSignInRequest?: (url: string) => boolean | void;
  /**
   * A reply linked to a page on your own origin. Return true when your router
   * handled it. Default: History API push plus `popstate` and a
   * `busymate:hostnavigate` window event, falling back to a normal navigation.
   */
  readonly onNavigate?: (href: string) => boolean | void;
  /** CSP nonce for the SDK's `<style>` element. */
  readonly nonce?: string;
  /** Milliseconds your provider may take before the frame is told to continue anonymous (the late answer still upgrades in place). Default 1500. */
  readonly identityBudgetMs?: number;
}

/** Link status: what the SDK knows about the visitor's account link. */
export type LinkState = "unlinked" | "linking" | "linked" | "failed";

/**
 * Reason codes the SDK emits today. `reason` is a stable string field; codes
 * reported by the hosted chat (busymate-ai-src#2069) arrive as additional
 * strings, so always handle unknown values.
 */
export type KnownLinkReason =
  // linking
  | "identity_requested"
  | "identity_offered"
  | "account_changed"
  // linked
  | "identified"
  // unlinked
  | "anonymous"
  | "no_provider"
  | "not_signed_in"
  | "signed_out"
  | "switched"
  | "expired"
  // failed
  | "mint_failed"
  | "mint_timeout"
  | "invalid_identity"
  | "nonce_mismatch"
  | "not_verified"
  | "origin_not_allowed";

export interface LinkStatus {
  readonly state: LinkState;
  /** Stable machine-readable code. Unknown values are possible: treat them as opaque. */
  readonly reason: KnownLinkReason | (string & {});
  /** Who decided: the SDK on this page, or the hosted chat. */
  readonly source: "sdk" | "frame";
  /** Epoch ms. */
  readonly at: number;
  /** A short human-readable hint for logs. Never contains a token, nonce or account id. */
  readonly detail?: string;
}

export interface ReadyEvent {
  readonly visitorKind: "anonymous" | "identified" | (string & {});
  /** The display claims the hosted chat chose to share (for example `name`). */
  readonly displayClaims?: Readonly<Record<string, unknown>>;
}

export type OpenSource = "api" | "launcher" | "frame" | "escape" | "restore" | "navigate";

export interface WireMessageEvent {
  /** The wire type, for example `busymate.ai.v1.navigate`. */
  readonly type: string;
  /** The message as the frame posted it. Never contains a token (the frame never posts one). */
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ErrorEvent {
  readonly code: "origin_not_allowed" | "frame_silent" | "invalid_option" | (string & {});
  readonly message: string;
}

/** Every event the SDK emits, by name. */
export interface BusymateChatEvents {
  ready: ReadyEvent;
  open: { readonly source: OpenSource };
  close: { readonly source: OpenSource };
  /** Every validated frame → host wire message, for observability. */
  message: WireMessageEvent;
  linkStatus: LinkStatus;
  navigate: { readonly href: string };
  signInRequest: { readonly url: string };
  sessionEnded: { readonly sessionId?: string };
  error: ErrorEvent;
}

export type BusymateChatEventName = keyof BusymateChatEvents;

export interface AskOptions {
  /** Default true: send the prompt. false: only fill the composer. */
  readonly submit?: boolean;
}

/** The handle `createBusymateChat()` returns. */
export interface BusymateChat {
  /** SDK and contract versions. */
  readonly version: string;
  readonly contractVersion: number;
  /** The assistant's serving origin (exact). */
  readonly origin: string;
  readonly assistant: string;
  readonly mode: ChatMode;

  /** Insert the frame (and launcher). Returns false outside a browser or when already mounted. */
  mount(): boolean;
  /** Remove every element and listener the SDK added. The handle can be mounted again. */
  unmount(): void;
  readonly mounted: boolean;

  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;

  /** Send a prompt through the chat's composer (opens the panel). False for empty text. */
  ask(text: string, options?: AskOptions): boolean;
  setTheme(theme: Theme): boolean;
  /** `null` unpins: the chat negotiates its own language again. */
  setLocale(locale: string | null): boolean;

  /** Identity provider used for every ask from the chat. */
  setIdentityProvider(provider: IdentityProvider | null, account?: (() => string | null | undefined) | null): void;
  /** Offer a server-signed identity to the chat now (in place, same conversation). */
  identify(identity: BusymateIdentity): boolean;
  /**
   * Legacy alias. `setUser(identity)` = `identify`; `setUser(null)` = `signedOut()`.
   * @deprecated Call `identityChanged()` / `signedOut()`.
   */
  setUser(identity: BusymateIdentity | null): boolean;
  /** Your customer signed in, rotated a token or changed account: re-ask the provider and upgrade in place. */
  identityChanged(): Promise<boolean>;
  /**
   * Your customer signed out: the chat drops the verified identity and the previous transcript.
   * Call it on every logout; without it the next person at this browser sees the previous person's chat.
   */
  signedOut(reason?: RevokeReason): boolean;
  /**
   * Legacy alias of `signedOut()`.
   * @deprecated Call `signedOut()`.
   */
  logout(reason?: RevokeReason): boolean;
  /**
   * Legacy alias: withdraw the current person's chat, then link the next one (from `next` or the provider).
   * @deprecated Call `identityChanged()` after the switch: the same conversation upgrades in place.
   */
  switchAccount(next?: BusymateIdentity | null): Promise<boolean>;
  /**
   * Legacy alias of `identityChanged()` (the script tag's old name).
   * @deprecated Call `identityChanged()`.
   */
  refreshIdentity(): Promise<boolean>;

  /**
   * Page tools: let the assistant act on your page (the in-chat `sign_in` card, forms, lookups).
   * The runtime loads once, on first call, from the assistant origin (needs `script-src` for it:
   * `cspDirectives({ pageTools: true })`). Tools are exposed to this assistant's origin only.
   */
  registerPageTools(tools: readonly PageTool[], options?: PageToolsOptions): Promise<PageToolsHandle>;
  /** Remove tools by name (or all this page registered when omitted). */
  unregisterPageTools(names?: readonly string[]): Promise<void>;
  /** Turn `<form toolname="...">` markup on this page into page tools. */
  registerDeclarativeForms(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
  /** The latest link status. */
  readonly linkStatus: LinkStatus;
  /** Subscribe to link status; called immediately with the current value. Returns unsubscribe. */
  onLinkStatus(listener: (status: LinkStatus) => void): () => void;

  /** Promote the durable visitor token once your consent manager allows it. */
  releaseConsent(): void;

  on<K extends BusymateChatEventName>(name: K, listener: (event: BusymateChatEvents[K]) => void): () => void;
  off<K extends BusymateChatEventName>(name: K, listener: (event: BusymateChatEvents[K]) => void): void;

  /** The current frame URL (without its fragment). Useful for support tickets. */
  frameUrl(): string | null;
}
