/**
 * Identity service (F18 register, F19 login/logout/reset).
 *
 * Pure orchestration over the ports: no SQL, no framework, no clock of its own.
 * Everything time- or config-dependent is injected, so the security-critical
 * paths — lockout window, single-use reset, rehash-on-login — are exercised by
 * fast unit tests against the in-memory store with a controllable clock.
 */
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '@forum/core'

import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import type { AccountStore, AuthConfig, Clock, AccountRecord } from './ports'

export interface IdentityDeps {
  readonly store: AccountStore
  readonly config: AuthConfig
  /** Defaults to `() => new Date()`; injected in tests. */
  readonly clock?: Clock
}

export interface RegisterInput {
  readonly username: string
  readonly email: string
  readonly password: string
}

export interface RegisterResult {
  readonly account: AccountRecord
  /**
   * Present only when activation is by email: the caller emails this. The
   * service never sends mail itself — that is an outbox concern (F07).
   */
  readonly verificationToken?: string
}

export interface LoginResult {
  readonly account: AccountRecord
  /** Opaque session token; the caller sets it as an HttpOnly cookie. */
  readonly sessionToken: string
  readonly expiresAt: Date
}

/** Result of requesting a reset. The token is null when no account matched. */
export interface ResetRequest {
  readonly token: string | null
  readonly userId: number | null
}

const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

export class IdentityService {
  private readonly store: AccountStore
  private readonly config: AuthConfig
  private readonly now: Clock

  constructor(deps: IdentityDeps) {
    this.store = deps.store
    this.config = deps.config
    this.now = deps.clock ?? (() => new Date())
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const username = input.username.trim()
    const email = input.email.trim()
    const usernameLower = username.toLocaleLowerCase()
    const emailLower = email.toLocaleLowerCase()

    this.assertUsername(username, usernameLower)
    this.assertEmail(email)
    if (input.password.length < this.config.minPasswordLength) {
      throw new ValidationError(
        `Password must be at least ${this.config.minPasswordLength} characters.`,
      )
    }

    // Uniqueness is checked here for a friendly message, but the DB unique index
    // on username_lower/email_lower is the real arbiter under a race — the
    // Postgres repo maps its violation onto ConflictError too.
    if (await this.store.accounts.findByUsernameLower(usernameLower)) {
      throw new ConflictError('That username is taken.')
    }
    if (await this.store.accounts.findByEmailLower(emailLower)) {
      throw new ConflictError('That email is already registered.')
    }

    const encoded = await hashPassword(input.password)

    const state =
      this.config.activationMethod === 'none' ? 'active' : 'awaiting_activation'

    const account = await this.store.accounts.create({
      username,
      usernameLower,
      email,
      emailLower,
      passwordHash: encoded,
      passwordAlgo: PASSWORD_ALGO,
      state,
      primaryGroupId: this.config.defaultMemberGroupId,
    })

    if (
      this.config.activationMethod === 'email' ||
      this.config.activationMethod === 'both'
    ) {
      const token = generateToken()
      await this.store.tokens.issue({
        tokenHash: await hashToken(token),
        userId: account.id,
        purpose: 'email_verification',
        expiresAt: new Date(this.now().getTime() + 24 * 60 * 60 * 1000),
      })
      return { account, verificationToken: token }
    }

    return { account }
  }

  /**
   * `bucket` is a caller-chosen lockout key — typically the lower-cased username
   * (so guessing one account cannot lock another) optionally combined with a
   * coarse client identifier. Kept a parameter so the policy lives at the edge.
   */
  async login(
    identifier: string,
    password: string,
    bucket: string,
  ): Promise<LoginResult> {
    const at = this.now()

    // 1. Lockout check FIRST — before any hashing — so a locked bucket cannot be
    //    used as a hashing oracle or CPU sink.
    if (this.config.maxLoginAttempts > 0) {
      const since = new Date(at.getTime() - this.config.lockoutMinutes * 60_000)
      const failures = await this.store.loginAttempts.countFailuresSince(bucket, since)
      if (failures >= this.config.maxLoginAttempts) {
        throw new ForbiddenError(
          'Too many failed attempts. Please wait before trying again.',
        )
      }
    }

    const idLower = identifier.trim().toLocaleLowerCase()
    const account =
      (await this.store.accounts.findByUsernameLower(idLower)) ??
      (await this.store.accounts.findByEmailLower(idLower))

    // 2. Always verify against *something*. If the account is missing we still
    //    run a verify against a real throwaway hash so the response time does
    //    not reveal whether the username exists (user-enumeration defence).
    const encoded = account?.passwordHash ?? (await dummyHash())
    // verifyPassword(password, hash) — order matters; getting it backwards was a
    // real bug the service tests caught before it could break every login.
    const ok = await verifyPassword(password, encoded)

    if (!account || !ok || account.passwordHash === null) {
      await this.store.loginAttempts.record(bucket, false, at)
      throw new ValidationError('Incorrect username or password.')
    }

    if (account.state === 'banned') {
      await this.store.loginAttempts.record(bucket, false, at)
      throw new ForbiddenError('This account is banned.')
    }
    if (account.state === 'awaiting_activation') {
      await this.store.loginAttempts.record(bucket, false, at)
      throw new ForbiddenError('This account is not yet activated.')
    }

    // 3. Success. Clear the bucket and transparently upgrade a stale hash (F17).
    await this.store.loginAttempts.record(bucket, true, at)
    await this.store.loginAttempts.clear(bucket)

    if (needsRehash(encoded)) {
      const upgraded = await hashPassword(password)
      await this.store.accounts.updatePassword(account.id, upgraded, PASSWORD_ALGO)
    }

    return this.startSession(account, at)
  }

  async logout(sessionToken: string): Promise<void> {
    const session = await this.store.sessions.findByTokenHash(await hashToken(sessionToken))
    if (session) await this.store.sessions.revoke(session.id)
  }

  /**
   * Resolve a session cookie to the live user id behind it, or null.
   *
   * Validity — not revoked, not expired — is judged HERE, in the domain, rather
   * than in the app's request context: the repository deliberately returns the
   * raw row (so an audit tool can see revoked sessions), and "is this session
   * still good?" is a security rule that must not be re-implemented per caller.
   */
  async resolveSession(sessionToken: string): Promise<{ userId: number } | null> {
    const session = await this.store.sessions.findByTokenHash(await hashToken(sessionToken))
    if (!session) return null
    if (session.revokedAt !== null) return null
    if (session.expiresAt.getTime() <= this.now().getTime()) return null
    return { userId: session.userId }
  }

  /**
   * Request a reset. Returns a token to email ONLY when an account matched, but
   * the caller must show the same confirmation either way — the null case is
   * how enumeration is avoided at the boundary.
   */
  async requestPasswordReset(email: string): Promise<ResetRequest> {
    const account = await this.store.accounts.findByEmailLower(
      email.trim().toLocaleLowerCase(),
    )
    if (!account) return { token: null, userId: null }

    // Invalidate outstanding reset tokens so only the newest email works.
    await this.store.tokens.revokeAllForUser(account.id, 'password_reset')

    const token = generateToken()
    await this.store.tokens.issue({
      tokenHash: await hashToken(token),
      userId: account.id,
      purpose: 'password_reset',
      expiresAt: new Date(
        this.now().getTime() + this.config.resetTokenTtlMinutes * 60_000,
      ),
    })
    return { token, userId: account.id }
  }

  async redeemPasswordReset(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < this.config.minPasswordLength) {
      throw new ValidationError(
        `Password must be at least ${this.config.minPasswordLength} characters.`,
      )
    }

    const redeemed = await this.store.tokens.consume(
      await hashToken(token),
      'password_reset',
      this.now(),
    )
    if (!redeemed) {
      throw new ValidationError('This reset link is invalid or has expired.')
    }

    const encoded = await hashPassword(newPassword)
    await this.store.accounts.updatePassword(redeemed.userId, encoded, PASSWORD_ALGO)
    // Resetting a password logs out everywhere: a reset is also the remedy for a
    // suspected compromise, so lingering sessions must die.
    await this.store.sessions.revokeAllForUser(redeemed.userId)
  }

  private async startSession(account: AccountRecord, at: Date): Promise<LoginResult> {
    const token = generateToken()
    const expiresAt = new Date(at.getTime() + this.config.sessionIdleDays * 86_400_000)
    await this.store.sessions.create({
      tokenHash: await hashToken(token),
      userId: account.id,
      expiresAt,
    })
    return { account, sessionToken: token, expiresAt }
  }

  private assertUsername(username: string, usernameLower: string): void {
    if (
      username.length < this.config.usernameMin ||
      username.length > this.config.usernameMax
    ) {
      throw new ValidationError(
        `Username must be between ${this.config.usernameMin} and ${this.config.usernameMax} characters.`,
      )
    }
    if (!USERNAME_RE.test(username)) {
      throw new ValidationError('Username contains invalid characters.')
    }
    if (this.config.reservedUsernames.includes(usernameLower)) {
      throw new ConflictError('That username is reserved.')
    }
  }

  private assertEmail(email: string): void {
    // Deliberately permissive: the only authoritative proof an address is real
    // is a delivered verification email, so over-strict regexes just reject
    // valid addresses. This catches obvious garbage, nothing more.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError('Please enter a valid email address.')
    }
  }
}

/**
 * A real argon2id hash of a random string, used only to spend comparable CPU
 * time when the account does not exist (enumeration defence). Computed once on
 * first miss and memoised — it must be a genuine hash at the policy cost, or the
 * verifier would reject it cheaply and the timing would give the game away,
 * which is exactly the bug the first hardcoded constant had.
 */
let dummyHashPromise: Promise<string> | null = null
function dummyHash(): Promise<string> {
  if (dummyHashPromise === null) {
    dummyHashPromise = hashPassword(generateToken())
  }
  return dummyHashPromise
}

/** hashPassword always emits argon2id, so the stored algo tag is constant. */
const PASSWORD_ALGO = 'argon2id'
