import { randomId } from "./env.js";
import { HOST_CLASS, HOST_MESSAGE, REVOKE_REASONS, type IdentityAskReason, type RevokeReason, type UnavailableReason } from "./wire.js";
import type { BusymateIdentity, IdentityProvider, IdentityRequest, LinkStatus } from "./types.js";

/** How long a provider may take before the frame is told to continue (it still upgrades in place later). */
export const DEFAULT_IDENTITY_BUDGET_MS = 1_500;
/** A provider that has not settled by then is reported as `mint_timeout`. */
export const PROVIDER_HARD_TIMEOUT_MS = 15_000;
/** With no provider, a parked ask is answered `not_signed_in` after this long (a provider set later still upgrades in place). */
export const PARKED_ASK_MS = 250;
/** After an offer, how long the chat may stay anonymous before the link is reported `not_verified`. */
export const VERIFY_GRACE_MS = 6_000;

type Message = Record<string, unknown> & { type: string };

export interface IdentityLinkOptions {
  provider: IdentityProvider | null;
  account: (() => string | null | undefined) | null;
  budgetMs: number;
  /** A one-time identity this page already holds (the sign-in return fragment). */
  launchIdentity: BusymateIdentity | null;
  /** Post now, to the frame that asked (an answer to an ask). */
  reply: (message: Message) => void;
  /** Post to the live frame, queued until its wires are up (an unprompted offer or control). */
  send: (message: Message) => void;
  onStatus: (status: LinkStatus) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** Is this a usable `{ token, nonce }` pair? */
export function isIdentity(value: unknown): value is BusymateIdentity {
  const v = value as BusymateIdentity | null;
  return !!v && typeof v.token === "string" && v.token.length > 0 && typeof v.nonce === "string" && v.nonce.length > 0;
}

/** An error your provider may throw to name the failure (`err.code`). */
export class IdentityError extends Error {
  constructor(readonly code: "mint_failed" | "nonce_mismatch" | "invalid_identity" | "not_signed_in", message?: string) {
    super(message ?? code);
    this.name = "IdentityError";
  }
}

type Outcome =
  | { kind: "identity"; identity: BusymateIdentity }
  | { kind: "none" }
  | { kind: "failed"; reason: "mint_failed" | "invalid_identity" | "nonce_mismatch" | "mint_timeout"; detail: string };

const FAILURE_CODES = new Set(["mint_failed", "invalid_identity", "nonce_mismatch"]);

/**
 * The page side of end-user identity linking: answers the chat's asks from your
 * provider, offers, withdraws and switches identities in place, and keeps a
 * link status with a stable `reason` code. Pure of the DOM: the chat wires
 * `reply`/`send` to the frame.
 */
export class IdentityLink {
  private provider: IdentityProvider | null;
  private account: (() => string | null | undefined) | null;
  private launchIdentity: BusymateIdentity | null;
  private lastAccount: string | null = null;
  private currentToken: string | null = null;
  private parkedAsk: { reason: IdentityAskReason; deadlineAt?: number } | null = null;
  private verifyTimer: unknown = null;
  private statusValue: LinkStatus;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private disposed = false;

  constructor(private readonly options: IdentityLinkOptions) {
    this.provider = options.provider;
    this.account = options.account;
    this.launchIdentity = isIdentity(options.launchIdentity) ? options.launchIdentity : null;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.statusValue = this.make("unlinked", this.provider ? "anonymous" : "no_provider", "sdk");
  }

  get status(): LinkStatus {
    return this.statusValue;
  }

  /** Hold an identity for the next frame launch (before mount, or the sign-in return fragment). */
  setLaunchIdentity(identity: BusymateIdentity): boolean {
    if (!isIdentity(identity)) {
      this.setStatus("failed", "invalid_identity", "sdk", "identify() needs a { token, nonce } pair");
      return false;
    }
    this.launchIdentity = { token: identity.token, nonce: identity.nonce };
    return true;
  }

  /** The identity to put on the frame URL's fragment at mount (consumed once). */
  takeLaunchIdentity(): BusymateIdentity | null {
    const identity = this.launchIdentity;
    this.launchIdentity = null;
    if (identity) {
      this.currentToken = identity.token;
      this.setStatus("linking", "identity_offered", "sdk", "carried on the frame URL fragment");
    }
    return identity;
  }

  /** The frame document was replaced: it holds no identity until it asks or is offered one. */
  frameReplaced(): void {
    this.currentToken = null;
  }

  setProvider(provider: IdentityProvider | null, account?: (() => string | null | undefined) | null): void {
    this.provider = provider;
    if (account !== undefined) this.account = account;
    if (!provider && this.statusValue.state === "unlinked") this.setStatus("unlinked", "no_provider", "sdk");
    const parked = this.parkedAsk;
    this.parkedAsk = null;
    if (parked && provider) void this.answerAsk(parked.reason, parked.deadlineAt, true);
  }

  /**
   * The chat asked who the visitor is. Answers within the frame's own deadline;
   * an identity that lands later still upgrades the live chat in place.
   */
  async answerAsk(reason: IdentityAskReason, deadlineAt?: number, late = false): Promise<void> {
    if (this.disposed) return;
    const account = this.readAccount();
    if (account !== undefined) {
      // Another account, or none: the previous person's chat is withdrawn first.
      if (this.lastAccount && account !== this.lastAccount) this.revoke(account ? "switched" : "signed_out");
      this.lastAccount = account;
      if (account === null && !this.launchIdentity) {
        this.answer(late, { kind: "none" });
        return;
      }
    }
    if (this.launchIdentity) {
      const identity = this.launchIdentity;
      this.launchIdentity = null;
      this.answer(late, { kind: "identity", identity });
      return;
    }
    if (!this.provider) {
      // Remember the ask: it is answered the moment a provider is set.
      // A guest page answers quickly so the chat does not wait out its deadline.
      this.parkedAsk = { reason, deadlineAt };
      this.setStatus("unlinked", "no_provider", "sdk", "the chat asked before an identity provider was set");
      if (!late) {
        this.setTimer(() => {
          if (this.parkedAsk && !this.disposed) this.options.reply(this.unavailable("not_signed_in"));
        }, PARKED_ASK_MS);
      }
      return;
    }
    this.setStatus("linking", "identity_requested", "sdk", `the chat asked (${reason})`);
    let budget = this.options.budgetMs;
    if (typeof deadlineAt === "number") budget = Math.max(0, Math.min(budget, deadlineAt - this.now() - 100));
    const pending = this.mint(reason);
    let answered = late;
    const timer = late
      ? null
      : this.setTimer(() => {
          if (answered) return;
          answered = true;
          // "Resume what you hold": the chat continues; a late identity upgrades it in place.
          this.options.reply(this.unavailable("unsupported"));
        }, budget);
    const outcome = await pending;
    if (timer !== null) this.clearTimer(timer);
    if (this.disposed) return;
    this.answer(answered, outcome);
    answered = true;
  }

  /** Offer an identity your page already holds, in place. */
  identify(identity: BusymateIdentity): boolean {
    if (!isIdentity(identity)) {
      this.setStatus("failed", "invalid_identity", "sdk", "identify() needs a { token, nonce } pair");
      return false;
    }
    if (identity.token === this.currentToken) return true;
    this.offer(identity, false);
    return true;
  }

  /** Sign-in, token rotation or account change on your page: re-ask the provider. */
  async changed(): Promise<boolean> {
    if (!this.provider) {
      this.setStatus("unlinked", "no_provider", "sdk");
      return false;
    }
    const account = this.readAccount();
    if (account !== undefined) {
      if (this.lastAccount && account !== this.lastAccount) this.revoke(account ? "switched" : "signed_out");
      this.lastAccount = account;
    }
    this.setStatus("linking", "account_changed", "sdk");
    const outcome = await this.mint("changed");
    if (this.disposed) return false;
    this.answer(true, outcome);
    return outcome.kind === "identity";
  }

  /** Withdraw the verified identity (and the previous transcript) in the chat. */
  logout(reason: RevokeReason = "signed_out"): boolean {
    this.revoke((REVOKE_REASONS as readonly string[]).includes(reason) ? reason : "signed_out");
    this.lastAccount = null;
    return true;
  }

  /** Withdraw the current person's chat, then link the next one. */
  async switchAccount(next?: BusymateIdentity | null): Promise<boolean> {
    this.revoke("switched");
    this.lastAccount = this.readAccount() ?? null;
    if (next === null) return false;
    if (next !== undefined) return this.identify(next);
    if (!this.provider) return false;
    this.setStatus("linking", "account_changed", "sdk");
    const outcome = await this.mint("switch");
    if (this.disposed) return false;
    this.answer(true, outcome);
    return outcome.kind === "identity";
  }

  /** The chat posted `ready` with the session's visitor kind. */
  ready(visitorKind: string): void {
    if (visitorKind === "identified") {
      this.cancelVerify();
      this.setStatus("linked", "identified", "frame");
      return;
    }
    if (this.statusValue.state === "linked") {
      this.setStatus("unlinked", "anonymous", "frame", "the chat runs anonymous now");
      return;
    }
    if (this.statusValue.state === "linking" && this.statusValue.reason === "identity_offered") {
      // A late offer may still be upgrading the session: give it a grace window.
      this.startVerify();
      return;
    }
    if (this.statusValue.state === "unlinked" && this.statusValue.reason === "anonymous") return;
  }

  /** `busymate.identity.v1.ack` from the chat: what it did with an answer. */
  ack(outcome: unknown): void {
    if (typeof outcome !== "string") return;
    if (outcome === "identified") return this.ready("identified");
    if (outcome === "anonymous") {
      if (this.statusValue.state !== "failed") this.setStatus("unlinked", "anonymous", "frame");
      return;
    }
    if (outcome.startsWith("rejected:")) {
      this.cancelVerify();
      const code = outcome.slice("rejected:".length) || "rejected";
      this.setStatus("failed", code, "frame", outcome);
    }
  }

  /** The SDK cannot frame the chat on this page. */
  originRefused(): void {
    this.setStatus("failed", "origin_not_allowed", "sdk", "this page's origin is not in the workspace's allowed embed origins");
  }

  dispose(): void {
    this.disposed = true;
    this.cancelVerify();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private readAccount(): string | null | undefined {
    if (!this.account) return undefined;
    try {
      const value = this.account();
      return value == null || value === "" ? null : String(value);
    } catch {
      return undefined;
    }
  }

  private async mint(reason: IdentityRequest["reason"]): Promise<Outcome> {
    const provider = this.provider;
    if (!provider) return { kind: "none" };
    const request: IdentityRequest = { nonce: randomId(32), reason };
    let hardTimer: unknown = null;
    const timeout = new Promise<Outcome>((resolve) => {
      hardTimer = this.setTimer(
        () => resolve({ kind: "failed", reason: "mint_timeout", detail: `your identity provider did not settle within ${PROVIDER_HARD_TIMEOUT_MS / 1000} s` }),
        PROVIDER_HARD_TIMEOUT_MS,
      );
    });
    const result = Promise.resolve()
      .then(() => provider(request))
      .then<Outcome>((value) => {
        if (value === null || value === undefined) return { kind: "none" };
        if (!isIdentity(value)) return { kind: "failed", reason: "invalid_identity", detail: "the provider returned something other than { token, nonce } or null" };
        return { kind: "identity", identity: { token: value.token, nonce: value.nonce } };
      })
      .catch<Outcome>((error: unknown) => {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "not_signed_in") return { kind: "none" };
        const reason = typeof code === "string" && FAILURE_CODES.has(code) ? (code as "mint_failed" | "invalid_identity" | "nonce_mismatch") : "mint_failed";
        const message = error instanceof Error ? error.message : String(error);
        return { kind: "failed", reason, detail: message.slice(0, 200) };
      });
    const outcome = await Promise.race([result, timeout]);
    this.clearTimer(hardTimer);
    return outcome;
  }

  /** Deliver an outcome: as the direct reply to an ask, or (late) as an in-place offer/control. */
  private answer(late: boolean, outcome: Outcome): void {
    if (outcome.kind === "identity") {
      if (late) {
        if (outcome.identity.token !== this.currentToken) this.offer(outcome.identity, false);
        return;
      }
      this.offer(outcome.identity, true);
      return;
    }
    if (outcome.kind === "none") {
      const message = this.unavailable("not_signed_in");
      if (late) this.options.send(message);
      else this.options.reply(message);
      this.setStatus("unlinked", "not_signed_in", "sdk");
      return;
    }
    const message = this.unavailable(outcome.reason === "mint_timeout" ? "unsupported" : "mint_failed");
    if (late) this.options.send(message);
    else this.options.reply(message);
    this.setStatus("failed", outcome.reason, "sdk", outcome.detail);
  }

  private offer(identity: BusymateIdentity, asReply: boolean): void {
    this.currentToken = identity.token;
    this.cancelVerify();
    const message = { type: HOST_MESSAGE.identity, token: identity.token, nonce: identity.nonce, hc: HOST_CLASS };
    if (asReply) this.options.reply(message);
    else this.options.send(message);
    this.setStatus("linking", "identity_offered", "sdk");
  }

  private revoke(reason: RevokeReason): void {
    this.cancelVerify();
    this.options.send({ type: HOST_MESSAGE.identityRevoked, v: 1, reason });
    this.currentToken = null;
    this.setStatus("unlinked", reason, "sdk");
  }

  private unavailable(reason: UnavailableReason): Message {
    return { type: HOST_MESSAGE.identityUnavailable, v: 1, reason, hc: HOST_CLASS };
  }

  private startVerify(): void {
    this.cancelVerify();
    this.verifyTimer = this.setTimer(() => {
      this.verifyTimer = null;
      if (this.statusValue.state !== "linking") return;
      this.setStatus(
        "failed",
        "not_verified",
        "sdk",
        "an identity was offered but the chat stayed anonymous: check the token claims, your JWKS and clock skew (Console linking timeline)",
      );
    }, VERIFY_GRACE_MS);
  }

  private cancelVerify(): void {
    if (this.verifyTimer !== null) this.clearTimer(this.verifyTimer);
    this.verifyTimer = null;
  }

  private make(state: LinkStatus["state"], reason: string, source: LinkStatus["source"], detail?: string): LinkStatus {
    return Object.freeze({ state, reason, source, at: this.now(), ...(detail ? { detail } : {}) });
  }

  private setStatus(state: LinkStatus["state"], reason: string, source: LinkStatus["source"], detail?: string): void {
    const previous = this.statusValue;
    if (previous.state === state && previous.reason === reason && previous.detail === detail) return;
    this.statusValue = this.make(state, reason, source, detail);
    this.options.onStatus(this.statusValue);
  }
}
