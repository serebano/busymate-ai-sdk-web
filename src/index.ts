// @busymate/ai-web — the official Busymate AI SDK for the web.
// Safe to import during server rendering: nothing here touches the DOM until
// `createBusymateChat(...).mount()` runs in a browser.
export { createBusymateChat } from "./chat.js";
export { mintFromEndpoint, type MintEndpointOptions } from "./mint.js";
export { IdentityError, isIdentity } from "./identity.js";
export { cspDirectives, cspHeader, IFRAME_POLICY, type CspOptions } from "./csp.js";
export { parseExactOrigin, defaultOrigin } from "./origins.js";
export { SDK_VERSION } from "./version.js";
export {
  CONTRACT_VERSION,
  BRIDGE_MARKER,
  EMBED_CHANNEL,
  IDENTITY_CONTRACT,
  FRAME_MESSAGE,
  HOST_MESSAGE,
  REVOKE_REASONS,
  UNAVAILABLE_REASONS,
  IDENTITY_ASK_REASONS,
  type IdentityAskReason,
  type RevokeReason,
  type UnavailableReason,
  type Theme,
} from "./wire.js";
export type {
  AskOptions,
  BusymateChat,
  BusymateChatEventName,
  BusymateChatEvents,
  BusymateChatOptions,
  BusymateIdentity,
  ChatMode,
  DockSide,
  ErrorEvent,
  IdentityProvider,
  IdentityRequest,
  KnownLinkReason,
  LauncherOptions,
  LinkState,
  LinkStatus,
  OpenSource,
  ReadyEvent,
  WireMessageEvent,
} from "./types.js";
