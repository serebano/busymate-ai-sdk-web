// The pinned wire between this SDK (the host page) and the hosted chat frame.
// CONTRACT-v1.md is the prose; contract.json is the same list as data. The
// release manifest pins this file's SHA-256: a change here is a new SDK
// version, never an edit to a shipped one.

/** The wire contract this SDK speaks (CONTRACT-v1.md). */
export const CONTRACT_VERSION = 1 as const;

/** The `?bridge=` marker that opts the frame into the product-neutral vocabulary. */
export const BRIDGE_MARKER = "busymate-ai-v1" as const;

/** The `?channel=` the frame is launched with: a parent web page owns the frame. */
export const EMBED_CHANNEL = "embed" as const;

/** The identity contract carried over the same postMessage channel. */
export const IDENTITY_CONTRACT = "busymate.identity/v1" as const;

/**
 * The host class reported to the frame on every identity answer (`hc`). The
 * hosted chat records one of a fixed list; `web-configure` is the listed class
 * for "a web page with a configured identity provider", which is what this SDK
 * is. A dedicated `web-sdk` class is a v1 follow-up on the hosted side.
 */
export const HOST_CLASS = "web-configure" as const;

/** Frame → host messages this SDK reads. Anything else is ignored. */
export const FRAME_MESSAGE = Object.freeze({
  ready: "busymate.ai.v1.ready",
  close: "busymate.ai.v1.close",
  openUrl: "busymate.ai.v1.open_url",
  navigate: "busymate.ai.v1.navigate",
  authRequest: "busymate.ai.v1.auth_request",
  identityRequest: "busymate.ai.v1.identity_request",
  resizeTo: "busymate.ai.v1.resize_to",
  resizeBy: "busymate.ai.v1.resize_by",
  resizeEnd: "busymate.ai.v1.resize_end",
  resizableRequest: "busymate.ai.v1.resizable_request",
  sessionEnded: "busymate.ai.v1.session_ended",
  identityAck: "busymate.identity.v1.ack",
  pipPrepare: "bmai:pip:prepare",
} as const);

/** Host → frame messages this SDK sends. */
export const HOST_MESSAGE = Object.freeze({
  identity: "busymate.ai.v1.identity",
  identityRevoked: "busymate.identity.v1.revoked",
  identityUnavailable: "busymate.identity.v1.unavailable",
  ask: "busymate.ai.v1.ask",
  theme: "busymate.ai.v1.theme",
  locale: "busymate.ai.v1.locale",
  keyboard: "busymate.ai.v1.keyboard",
  resizable: "busymate.ai.v1.resizable",
  pipReady: "bmai:pip:ready",
} as const);

export type FrameMessageType = (typeof FRAME_MESSAGE)[keyof typeof FRAME_MESSAGE];
export type HostMessageType = (typeof HOST_MESSAGE)[keyof typeof HOST_MESSAGE];

const FRAME_TYPES: readonly string[] = Object.values(FRAME_MESSAGE);

/** Is this a frame → host type the SDK understands? */
export function isFrameMessageType(type: unknown): type is FrameMessageType {
  return typeof type === "string" && FRAME_TYPES.includes(type);
}

/** Why the frame asks for identity (carried as `reason` on the ask). */
export const IDENTITY_ASK_REASONS = Object.freeze(["launch", "restart", "refresh", "resume", "reconnect", "retry"] as const);
export type IdentityAskReason = (typeof IDENTITY_ASK_REASONS)[number];

/** Why a verified identity is withdrawn (`identity.revoked`). */
export const REVOKE_REASONS = Object.freeze(["signed_out", "switched", "expired"] as const);
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/** Why the host cannot answer (`identity.unavailable`). */
export const UNAVAILABLE_REASONS = Object.freeze(["not_signed_in", "mint_failed", "unsupported"] as const);
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/** The frame URL's launch parameters, in the order the hosted loader sets them. */
export const FRAME_PATH_PREFIX = "/support/" as const;

/** The frame's iframe attributes. Leave them as they are: the hosted chat expects exactly these. */
export const IFRAME_SANDBOX = "allow-scripts allow-forms allow-same-origin" as const;
export const IFRAME_ALLOW = "tools; microphone; autoplay" as const;
export const IFRAME_REFERRER_POLICY = "strict-origin-when-cross-origin" as const;

/** The fragment keys. A fragment is never sent in a request, a Referer or an access log. */
export const FRAGMENT = Object.freeze({
  visitor: "bmai_visitor",
  token: "bmai_token",
  nonce: "bmai_nonce",
} as const);

/** First-party storage keys, shared with the hosted loader so a migrating site keeps its visitors. */
export function visitorKey(assistant: string): string {
  return "bm_support_visitor:" + assistant;
}
export function openStateKey(assistant: string): string {
  return "bm_widget_open:" + assistant;
}
export function panelSizeKey(assistant: string): string {
  return "bm_widget_size:" + assistant;
}

/** Shapes the hosted chat accepts. */
export const ASSISTANT_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const LOCALE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/i;
export const VISITOR_TOKEN = /^[A-Za-z0-9._-]{16,200}$/;
export const THEMES = Object.freeze(["light", "dark", "system"] as const);
export type Theme = (typeof THEMES)[number];
