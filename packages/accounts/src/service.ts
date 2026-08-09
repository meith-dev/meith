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
} from '@meith/core'

import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import { REGISTER_FIELD } from './register-fields'
import { matchBanFilter, type BanFilterSubject } from './ban-filter'
import { foldIdentifier } from './case-fold'
import type {
  AccountStore,
  AuthConfig,
  BanFilterRepository,
  BanRecord,
  Clock,
  AccountRecord,
  LoginBucket,
} from './ports'

export interface IdentityDeps {
  readonly store: AccountStore
  readonly config: AuthConfig
  /** Defaults to `() => new Date()`; injected in tests. */
  readonly clock?: Clock
  /**
   * F23 ban filters. Optional: a board with none configured, and the fixture
   * path, simply do not supply it. When present it is consulted on **both**
   * registration and login — a filter added after someone signed up has to stop
   * them coming back, or it only keeps out people who were never here.
   */
  readonly banFilters?: BanFilterRepository
  /**
   * F23's ban records, consulted on login.
   *
   * Optional in the same way and for the same reason as `banFilters`: the
   * fixture path has no ban table. Where it *is* supplied, it is the only thing
   * that answers "is this account banned" — see the check in `signIn`.
   */
  readonly bans?: BanLookup
}

/**
 * The half of `BanRepository` a login needs.
 *
 * Narrowed to one method on purpose: this service must not grow the ability to
 * ban, lift or expire. `BanService` owns those, and it takes the whole
 * repository.
 */
export interface BanLookup {
  findActive(userId: number): Promise<BanRecord | null>
}

/** Request-scoped facts a filter may match on. */
export interface RequestContext {
  readonly ip?: string | undefined
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

/**
 * How long a verification link lives.
 *
 * Exported because the message carrying the link has to say the same number.
 * A mail that promises 24 hours over a token that expires in one is a support
 * ticket, and the only way to keep the two honest is to have one of them.
 */
export const VERIFICATION_TTL_HOURS = 24

/**
 * What redeeming a verification link did (F18).
 *
 * A discriminated outcome rather than a boolean, because the screen has four
 * different things to say and `false` says none of them. The *copy* still
 * merges `invalid` with an expired link — see the route — but that is a
 * deliberate choice made where the words are written, not a distinction thrown
 * away here where it is still known.
 */
export type ActivationOutcome =
  /** The account was waiting and is now usable. */
  | 'activated'
  /**
   * The address is proven and the account stays `awaiting_activation`: the
   * `both` policy has a second gate, and only an administrator opens it.
   */
  | 'awaiting-approval'
  /** No such token, already used, or expired. */
  | 'invalid'
  /** The token was good, but somebody had already activated the account. */
  | 'already-active'
  /** The token was good and the account is banned. It stays banned. */
  | 'banned'

/**
 * Result of asking for another verification link.
 *
 * Shaped like `ResetRequest` and for the same reason: the caller must show one
 * notice whether or not anything was sent, so "nothing to send" is a null token
 * rather than an error it could accidentally surface.
 */
export interface ResendVerification {
  readonly token: string | null
  readonly account: AccountRecord | null
}

const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

export class IdentityService {
  private readonly store: AccountStore
  private readonly config: AuthConfig
  private readonly now: Clock

  /** Optional (F23): absent on a board with no filters, and in the fixture path. */
  private readonly banFilters: BanFilterRepository | undefined

  /** Optional (F23): absent in the fixture path, which has no ban table. */
  private readonly bans: BanLookup | undefined

  constructor(deps: IdentityDeps) {
    this.store = deps.store
    this.config = deps.config
    this.now = deps.clock ?? (() => new Date())
    this.banFilters = deps.banFilters
    this.bans = deps.bans
  }

  async register(
    input: RegisterInput,
    context: RequestContext = {},
  ): Promise<RegisterResult> {
    const username = input.username.trim()
    const email = input.email.trim()
    const usernameLower = foldIdentifier(username)
    const emailLower = foldIdentifier(email)

    await this.assertNotFiltered({ username, email, ip: context.ip })

    this.assertUsername(username, usernameLower)
    this.assertEmail(email)
    if (input.password.length < this.config.minPasswordLength) {
      throw new ValidationError(
        `Password must be at least ${this.config.minPasswordLength} characters.`,
        {},
        { meta: { field: REGISTER_FIELD.password } },
      )
    }

    // Uniqueness is checked here for a friendly message, but the DB unique index
    // on username_lower/email_lower is the real arbiter under a race — the
    // Postgres repo maps its violation onto ConflictError too.
    if (await this.store.accounts.findByUsernameLower(usernameLower)) {
      throw new ConflictError('That username is taken.', {
        meta: { field: REGISTER_FIELD.username },
      })
    }
    if (await this.store.accounts.findByEmailLower(emailLower)) {
      throw new ConflictError('That email is already registered.', {
        meta: { field: REGISTER_FIELD.email },
      })
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

    if (this.verifiesEmail()) {
      return { account, verificationToken: await this.issueVerification(account.id) }
    }

    return { account }
  }

  /** Whether this board's policy asks a new account to prove its address. */
  private verifiesEmail(): boolean {
    return (
      this.config.activationMethod === 'email' ||
      this.config.activationMethod === 'both'
    )
  }

  /** Mint a verification token for an account. The caller e-mails it. */
  private async issueVerification(userId: number): Promise<string> {
    const token = generateToken()
    await this.store.tokens.issue({
      tokenHash: await hashToken(token),
      userId,
      purpose: 'email_verification',
      expiresAt: new Date(
        this.now().getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
      ),
    })
    return token
  }

  /**
   * Redeem a verification link (F18).
   *
   * Two rules carry this method, and both are properties of a *write* rather
   * than of the code around it:
   *
   *  - `consume` is single-use and atomic, so a link followed twice — by the
   *    member and by their mail client's prefetch, say — activates once and
   *    reports `invalid` the second time.
   *  - `markEmailVerified` only activates an account still `awaiting_activation`.
   *    A banned account that redeems a link it was sent before the ban stays
   *    banned; the ban is the more recent decision and it wins.
   *
   * Under `both` the address is stamped and the state is left alone: confirming
   * the address is the first of two gates and an administrator holds the other.
   */
  async activateAccount(token: string): Promise<ActivationOutcome> {
    const redeemed = await this.store.tokens.consume(
      await hashToken(token),
      'email_verification',
      this.now(),
    )
    if (!redeemed) return 'invalid'

    const needsApproval = this.config.activationMethod === 'both'
    const previous = await this.store.accounts.markEmailVerified(
      redeemed.userId,
      this.now(),
      !needsApproval,
    )

    /*
     * The token was valid but its account is gone. Nothing to activate, and the
     * screen has nothing truthful to offer beyond "this link no longer works".
     */
    if (previous === null) return 'invalid'
    if (previous === 'banned') return 'banned'
    if (previous === 'active') return 'already-active'
    return needsApproval ? 'awaiting-approval' : 'activated'
  }

  /**
   * Issue a fresh verification link, invalidating any outstanding one.
   *
   * Returns a null token — not an error — for every case where nothing should
   * be sent: no such address, an account that is already active, one that is
   * banned, and one whose address is already proven and is merely waiting for
   * an administrator under `both`. The caller shows the same notice on all of
   * them, which is what stops this becoming an address oracle, and it can only
   * do that if "nothing to do" looks like success from here.
   *
   * Outstanding tokens are revoked first, for the reason
   * `requestPasswordReset` gives: only the newest link should work, or asking
   * twice leaves two live credentials in two mailboxes.
   */
  async resendVerification(email: string): Promise<ResendVerification> {
    if (!this.verifiesEmail()) return { token: null, account: null }

    const account = await this.store.accounts.findByEmailLower(foldIdentifier(email))
    if (!account) return { token: null, account: null }
    if (account.state !== 'awaiting_activation') return { token: null, account: null }
    if (account.emailVerifiedAt !== null) return { token: null, account: null }

    await this.store.tokens.revokeAllForUser(account.id, 'email_verification')
    return { token: await this.issueVerification(account.id), account }
  }

  /**
   * `buckets` are the caller-chosen lockout counters, and the policy lives at
   * the edge: see `loginBuckets` in `apps/community/src/server/auth-actions.ts`.
   *
   * A **list**, because a single counter cannot do the job. Keyed on the
   * username alone — which is what this took until the audit of 7 August 2026
   * — five wrong guesses by a stranger lock the named account for everybody,
   * including its owner with the right password, and usernames are printed on
   * every post. Keyed on the address alone, one account is no more protected
   * than the whole board. Every bucket is counted, every one can refuse, and a
   * success clears them all.
   *
   * A bare string is still accepted and means one bucket at the configured
   * ceiling — the shape the whole test suite is written in, and the honest
   * reading of "one counter" for a caller that only wants one.
   */
  async login(
    identifier: string,
    password: string,
    buckets: string | readonly LoginBucket[],
    context: RequestContext = {},
  ): Promise<LoginResult> {
    const at = this.now()
    const counters: readonly LoginBucket[] =
      typeof buckets === 'string' ? [{ key: buckets }] : buckets

    /*
     * 0. IP filters first, before any hashing. There is no enumeration risk —
     *    the address is the caller's own — and blocking early is the point: an
     *    abusive network should not get to spend our Argon2 budget.
     */
    await this.assertNotFiltered({ ip: context.ip })

    // 1. Lockout check FIRST — before any hashing — so a locked bucket cannot be
    //    used as a hashing oracle or CPU sink. Every counter is consulted: they
    //    are separate limits, not a fallback chain, and any one of them refusing
    //    is a refusal.
    const since = new Date(at.getTime() - this.config.lockoutMinutes * 60_000)
    for (const counter of counters) {
      const max = counter.max ?? this.config.maxLoginAttempts
      if (max <= 0) continue
      const failures = await this.store.loginAttempts.countFailuresSince(counter.key, since)
      if (failures >= max) {
        throw new ForbiddenError(
          'Too many failed attempts. Please wait before trying again.',
        )
      }
    }

    const idLower = foldIdentifier(identifier)
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

    const recordFailure = async (): Promise<void> => {
      for (const counter of counters) {
        await this.store.loginAttempts.record(counter.key, false, at)
      }
    }

    if (!account || !ok || account.passwordHash === null) {
      await recordFailure()
      throw new ValidationError('Incorrect username or password.')
    }

    /*
     * The ban **record**, not the state column.
     *
     * A ban is a `bans` row and a group move; F23 deliberately never writes
     * `users.state`, because a column saying `banned` with no row behind it is
     * an account nothing can un-ban correctly. So this check — written against
     * the column — could not fire, and a banned member signed straight back in.
     * Their sessions had been revoked and their group moved, so the board they
     * arrived on was mostly empty, which is the reason it went unnoticed: it
     * looked like a ban to everyone except the person it was for.
     *
     * The public reason is what they are shown. `reason` is the staff note and
     * routinely says things ("linked to the account we banned last week") that
     * must never be handed to the person it is about — the same rule
     * `BanService.assertNotBanned` states, which is where this refusal's wording
     * comes from.
     */
    const ban = await this.bans?.findActive(account.id)
    if (ban || account.state === 'banned') {
      await recordFailure()
      throw new ForbiddenError(
        ban?.publicReason
          ? `This account is banned: ${ban.publicReason}`
          : 'This account is banned.',
      )
    }
    if (account.state === 'awaiting_activation') {
      await recordFailure()
      throw new ForbiddenError('This account is not yet activated.')
    }

    /*
     * Username and email filters are checked *here*, after the password has
     * already been proven, and deliberately not earlier. Checking them up front
     * would answer "is this account filtered?" to anyone who can type a
     * username — a user-enumeration oracle, and this method goes to some length
     * elsewhere (the dummy hash) to avoid being exactly that.
     *
     * A filter added after someone registered has to stop them coming back, or
     * it only keeps out people who were never here.
     */
    await this.assertNotFiltered({ username: account.username, email: account.email })

    /*
     * 3. Success. Clear *every* counter and transparently upgrade a stale hash
     *    (F17). Clearing all of them is what keeps the wide backstop from
     *    accumulating across a member's ordinary mistyping over a long session:
     *    proving the password empties the record of having failed to.
     */
    for (const counter of counters) {
      await this.store.loginAttempts.record(counter.key, true, at)
      await this.store.loginAttempts.clear(counter.key)
    }

    if (needsRehash(encoded)) {
      const upgraded = await hashPassword(password)
      await this.store.accounts.updatePassword(account.id, upgraded, PASSWORD_ALGO)
    }

    return this.startSession(account, at)
  }

  /**
   * Refuse a subject matched by a ban filter (F23).
   *
   * A no-op when no filter repository was supplied, so a board with no filters
   * pays nothing. The message names neither the pattern nor the field: telling
   * someone *which* rule caught them is a map for evading it.
   */
  private async assertNotFiltered(subject: BanFilterSubject): Promise<void> {
    if (!this.banFilters) return

    const match = matchBanFilter(await this.banFilters.listAll(), subject)
    if (match) {
      throw new ForbiddenError(
        'This account cannot be used on this board. Contact an administrator if you believe this is a mistake.',
      )
    }
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
    const located = await this.locateSession(sessionToken)
    if (located === null) return null
    return { userId: located.userId }
  }

  /**
   * The live session row behind a cookie — its **id** as well as its owner.
   *
   * F75 needs the id to record where somebody is (`sessions.location_*`), and
   * it needs guests too, who have a session row and no user. `resolveSession`
   * delegates here rather than repeating the validity rule, which is the part
   * that must never have two implementations.
   */
  async locateSession(
    sessionToken: string,
  ): Promise<{ sessionId: number; userId: number } | null> {
    const session = await this.store.sessions.findByTokenHash(await hashToken(sessionToken))
    if (!session) return null
    if (session.revokedAt !== null) return null
    if (session.expiresAt.getTime() <= this.now().getTime()) return null
    return { sessionId: session.id, userId: session.userId }
  }

  /**
   * Request a reset. Returns a token to email ONLY when an account matched, but
   * the caller must show the same confirmation either way — the null case is
   * how enumeration is avoided at the boundary.
   */
  async requestPasswordReset(email: string): Promise<ResetRequest> {
    const account = await this.store.accounts.findByEmailLower(foldIdentifier(email))
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
        {},
        { meta: { field: REGISTER_FIELD.username } },
      )
    }
    if (!USERNAME_RE.test(username)) {
      throw new ValidationError('Username contains invalid characters.', {}, {
        meta: { field: REGISTER_FIELD.username },
      })
    }
    if (this.config.reservedUsernames.includes(usernameLower)) {
      throw new ConflictError(
        'That username is reserved. Pick another — the board keeps a few names ' +
          'for itself so an account cannot impersonate it.',
        { meta: { field: REGISTER_FIELD.username } },
      )
    }
  }

  private assertEmail(email: string): void {
    // Deliberately permissive: the only authoritative proof an address is real
    // is a delivered verification email, so over-strict regexes just reject
    // valid addresses. This catches obvious garbage, nothing more.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError('Please enter a valid email address.', {}, {
        meta: { field: REGISTER_FIELD.email },
      })
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
