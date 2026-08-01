/**
 * Session & remember-me orchestration (F17).
 *
 * Split out from IdentityService because the security-critical *decision* here —
 * what to do when a remember-me token is replayed — is pure orchestration over
 * the ports and deserves its own focused tests. Cookie handling (names, flags,
 * Set-Cookie) stays in the app layer; this service only knows tokens and repos.
 */
import { generateToken, hashToken } from './crypto/tokens'
import type { AccountStore, Clock } from './ports'

export interface SessionServiceDeps {
  readonly store: AccountStore
  /** Lifetime of a remember-me family (the "keep me logged in" horizon). */
  readonly rememberDays: number
  /** Idle lifetime of the short session the remember cookie mints. */
  readonly sessionIdleDays: number
  readonly clock?: Clock
}

export interface RememberedLogin {
  readonly userId: number
  readonly sessionToken: string
  readonly sessionExpiresAt: Date
  readonly rememberToken: string
  readonly rememberExpiresAt: Date
}

export type ResumeOutcome =
  | { readonly status: 'ok'; readonly login: RememberedLogin }
  /**
   * The presented token was already spent — a replay. The whole family has been
   * revoked and every live session for the user killed. The caller must clear
   * the cookies and force a fresh login.
   */
  | { readonly status: 'reuse'; readonly userId: number }
  | { readonly status: 'invalid' }

const DAY_MS = 86_400_000

export class SessionService {
  private readonly store: AccountStore
  private readonly rememberDays: number
  private readonly sessionIdleDays: number
  private readonly now: Clock

  constructor(deps: SessionServiceDeps) {
    this.store = deps.store
    this.rememberDays = deps.rememberDays
    this.sessionIdleDays = deps.sessionIdleDays
    this.now = deps.clock ?? (() => new Date())
  }

  /**
   * Start a short session and nothing else (F57).
   *
   * `startRemembered` mints a remember-me *family* as well, which is right for
   * a login where somebody ticked the box and wrong for what this is for: a
   * password change revokes every session including the current one, and the
   * device that made the change needs a fresh session — not a new long-lived
   * credential it never asked for.
   */
  async start(userId: number): Promise<{ token: string; expiresAt: Date }> {
    return this.mintSession(userId, this.now())
  }

  /** Start a brand-new remember-me family plus its first short session. */
  async startRemembered(userId: number): Promise<RememberedLogin> {
    const at = this.now()
    const familyId = generateToken()
    const rememberToken = generateToken()
    const rememberExpiresAt = new Date(at.getTime() + this.rememberDays * DAY_MS)
    await this.store.remember.issue({
      tokenHash: await hashToken(rememberToken),
      familyId,
      userId,
      expiresAt: rememberExpiresAt,
    })
    const session = await this.mintSession(userId, at)
    return {
      userId,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      rememberToken,
      rememberExpiresAt,
    }
  }

  /**
   * Present a remember-me token. On success the token is rotated (single-use)
   * and a new short session is minted. On replay the family is burned down.
   */
  async resume(rememberToken: string): Promise<ResumeOutcome> {
    const at = this.now()
    const nextToken = generateToken()
    const rotation = await this.store.remember.rotate({
      presentedHash: await hashToken(rememberToken),
      nextHash: await hashToken(nextToken),
      now: at,
      nextExpiresAt: new Date(at.getTime() + this.rememberDays * DAY_MS),
    })

    if (rotation.status === 'invalid') return { status: 'invalid' }

    if (rotation.status === 'reuse') {
      // Breach response: a spent token was presented again, so either the thief
      // or the victim is holding a stale copy. We cannot tell which, so we
      // invalidate the entire family AND every active session for the user —
      // both parties are forced to re-authenticate.
      await this.store.remember.revokeFamily(rotation.familyId, 'token_reuse', at)
      await this.store.sessions.revokeAllForUser(rotation.userId)
      return { status: 'reuse', userId: rotation.userId }
    }

    const session = await this.mintSession(rotation.userId, at)
    return {
      status: 'ok',
      login: {
        userId: rotation.userId,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        rememberToken: nextToken,
        rememberExpiresAt: new Date(at.getTime() + this.rememberDays * DAY_MS),
      },
    }
  }

  private async mintSession(
    userId: number,
    at: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken()
    const expiresAt = new Date(at.getTime() + this.sessionIdleDays * DAY_MS)
    await this.store.sessions.create({
      tokenHash: await hashToken(token),
      userId,
      expiresAt,
    })
    return { token, expiresAt }
  }
}
