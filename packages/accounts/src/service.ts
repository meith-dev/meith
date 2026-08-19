import { ConflictError, ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { type BanFilterSubject, matchBanFilter } from './ban-filter'
import { foldIdentifier } from './case-fold'
import { hashPassword, needsRehash, verifyPassword } from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import type {
  AccountRecord,
  AccountStore,
  AuthConfig,
  BanFilterRepository,
  BanRecord,
  Clock,
  LoginBucket,
} from './ports'
import { REGISTER_FIELD } from './register-fields'

export interface IdentityDeps {
  readonly store: AccountStore
  readonly config: AuthConfig
  readonly clock?: Clock
  readonly banFilters?: BanFilterRepository
  readonly bans?: BanLookup
  readonly secondFactor?: SecondFactorLookup
}

/**
 * Whether an account asks for something beyond its password. Kept as a port
 * rather than the whole two-factor service so that the login path cannot reach
 * the secrets it holds — it only ever needs the yes or no.
 */
export interface SecondFactorLookup {
  isEnrolled(userId: number): Promise<boolean>
}

export interface BanLookup {
  findActive(userId: number): Promise<BanRecord | null>
}

export interface RequestContext {
  readonly ip?: string | undefined
  readonly ipPrefix?: string | null | undefined
  readonly userAgent?: string | null | undefined
}

export interface RegisterInput {
  readonly username: string
  readonly email: string
  readonly password: string
}

export interface RegisterResult {
  readonly account: AccountRecord
  readonly verificationToken?: string
}

export interface LoginResult {
  readonly account: AccountRecord
  readonly sessionToken: string
  readonly expiresAt: Date
}

/**
 * How long a half-finished sign-in waits for its second factor. Long enough to
 * fetch a phone from another room, short enough that a password proven on a
 * shared machine does not stay proven.
 */
export const SECOND_FACTOR_TTL_MINUTES = 10

export type LoginOutcome =
  | { readonly status: 'signed-in'; readonly login: LoginResult }
  | {
      readonly status: 'second-factor'
      readonly account: AccountRecord
      readonly token: string
      readonly expiresAt: Date
    }

export interface PendingSecondFactor {
  readonly userId: number
  readonly remember: boolean
}

export interface ResetRequest {
  readonly token: string | null
  readonly userId: number | null
}

export const VERIFICATION_TTL_HOURS = 24

export type ActivationOutcome =
  | 'activated'
  | 'awaiting-approval'
  | 'invalid'
  | 'already-active'
  | 'banned'

export interface ActivationResult {
  readonly outcome: ActivationOutcome
  readonly userId: number | null
}

export interface ResendVerification {
  readonly token: string | null
  readonly account: AccountRecord | null
}

const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

const USERNAME_CHARACTER_RE = /[\p{L}\p{N} ._-]/u

const USERNAME_ATTEMPTS = 50

const FALLBACK_USERNAME = 'member'

export interface FederatedProvision {
  readonly username: string
  readonly email: string
  readonly emailVerified: boolean
}

export const REGISTRATION_CLOSED = 'This board is not taking new members at the moment.'

export class IdentityService {
  private readonly store: AccountStore
  private readonly config: AuthConfig
  private readonly now: Clock

  private readonly banFilters: BanFilterRepository | undefined

  private readonly bans: BanLookup | undefined

  private readonly secondFactor: SecondFactorLookup | undefined

  constructor(deps: IdentityDeps) {
    this.store = deps.store
    this.config = deps.config
    this.now = deps.clock ?? (() => new Date())
    this.banFilters = deps.banFilters
    this.bans = deps.bans
    this.secondFactor = deps.secondFactor
  }

  async register(input: RegisterInput, context: RequestContext = {}): Promise<RegisterResult> {
    if (!this.config.registrationEnabled) {
      throw new ForbiddenError(REGISTRATION_CLOSED)
    }

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

    if (await this.store.accounts.findByUsernameLower(usernameLower)) {
      throw new ConflictError(msg('error.accounts.username-taken'), {
        meta: { field: REGISTER_FIELD.username },
      })
    }
    if (await this.store.accounts.findByEmailLower(emailLower)) {
      throw new ConflictError(msg('error.accounts.email-already-registered'), {
        meta: { field: REGISTER_FIELD.email },
      })
    }

    const encoded = await hashPassword(input.password)

    const state = this.config.activationMethod === 'none' ? 'active' : 'awaiting_activation'

    const account = await this.store.accounts.create({
      username,
      usernameLower,
      email,
      emailLower,
      passwordHash: encoded,
      passwordAlgo: PASSWORD_ALGO,
      state,
      primaryGroupId: this.config.defaultMemberGroupId,
      registrationIpPrefix: prefixOf(context),
    })

    if (this.verifiesEmail()) {
      return { account, verificationToken: await this.issueVerification(account.id) }
    }

    return { account }
  }

  async provisionFederated(
    input: FederatedProvision,
    context: RequestContext = {},
  ): Promise<RegisterResult> {
    if (!this.config.registrationEnabled) {
      throw new ForbiddenError(REGISTRATION_CLOSED)
    }

    const email = input.email.trim()
    const emailLower = foldIdentifier(email)

    this.assertEmail(email)
    await this.assertNotFiltered({ email, ip: context.ip })

    if (await this.store.accounts.findByEmailLower(emailLower)) {
      throw new ConflictError(msg('error.accounts.account-here-already-uses-address'), {
        meta: { field: REGISTER_FIELD.email },
      })
    }

    const username = await this.availableUsername(input.username)
    await this.assertNotFiltered({ username })

    const created = await this.store.accounts.create({
      username,
      usernameLower: foldIdentifier(username),
      email,
      emailLower,
      passwordHash: null,
      passwordAlgo: null,
      state: this.config.activationMethod === 'none' ? 'active' : 'awaiting_activation',
      primaryGroupId: this.config.defaultMemberGroupId,
      registrationIpPrefix: prefixOf(context),
    })

    if (!this.verifiesEmail()) return { account: created }

    if (!input.emailVerified) {
      return {
        account: created,
        verificationToken: await this.issueVerification(created.id),
      }
    }

    await this.store.accounts.markEmailVerified(
      created.id,
      this.now(),
      this.config.activationMethod !== 'both',
    )

    return { account: (await this.store.accounts.findById(created.id)) ?? created }
  }

  private async availableUsername(suggestion: string): Promise<string> {
    const base = this.usernameStem(suggestion)

    for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt += 1) {
      const suffix = attempt === 0 ? '' : String(attempt + 1)
      const stem = trimToLength(base, this.config.usernameMax - suffix.length)
      const candidate = `${stem}${suffix}`

      const lower = foldIdentifier(candidate)
      if (this.config.reservedUsernames.includes(lower)) continue
      if (await this.store.accounts.findByUsernameLower(lower)) continue

      return candidate
    }

    throw new ConflictError(msg('error.accounts.could-settle-free-username-for'), {
      meta: { field: REGISTER_FIELD.username },
    })
  }

  private usernameStem(suggestion: string): string {
    const cleaned = [...suggestion.normalize('NFC')]
      .filter((character) => USERNAME_CHARACTER_RE.test(character))
      .join('')
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/^[^\p{L}\p{N}]+/u, '')

    const stem = trimToLength(cleaned, this.config.usernameMax)
    if (codePointLength(stem) < this.config.usernameMin) {
      return trimToLength(
        FALLBACK_USERNAME.padEnd(this.config.usernameMin, '0'),
        this.config.usernameMax,
      )
    }
    return stem
  }

  private verifiesEmail(): boolean {
    return this.config.activationMethod === 'email' || this.config.activationMethod === 'both'
  }

  private async issueVerification(userId: number): Promise<string> {
    const token = generateToken()
    await this.store.tokens.issue({
      tokenHash: await hashToken(token),
      userId,
      purpose: 'email_verification',
      expiresAt: new Date(this.now().getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
    })
    return token
  }

  async activateAccount(token: string): Promise<ActivationResult> {
    const redeemed = await this.store.tokens.consume(
      await hashToken(token),
      'email_verification',
      this.now(),
    )
    if (!redeemed) return { outcome: 'invalid', userId: null }

    const userId = redeemed.userId
    const needsApproval = this.config.activationMethod === 'both'
    const previous = await this.store.accounts.markEmailVerified(userId, this.now(), !needsApproval)

    if (previous === null) return { outcome: 'invalid', userId: null }
    if (previous === 'banned') return { outcome: 'banned', userId }
    if (previous === 'active') return { outcome: 'already-active', userId }
    return { outcome: needsApproval ? 'awaiting-approval' : 'activated', userId }
  }

  async resendVerification(email: string): Promise<ResendVerification> {
    if (!this.verifiesEmail()) return { token: null, account: null }

    const account = await this.store.accounts.findByEmailLower(foldIdentifier(email))
    if (!account) return { token: null, account: null }
    if (account.state !== 'awaiting_activation') return { token: null, account: null }
    if (account.emailVerifiedAt !== null) return { token: null, account: null }

    await this.store.tokens.revokeAllForUser(account.id, 'email_verification')
    return { token: await this.issueVerification(account.id), account }
  }

  async login(
    identifier: string,
    password: string,
    buckets: string | readonly LoginBucket[],
    context: RequestContext = {},
    options: { readonly remember?: boolean } = {},
  ): Promise<LoginOutcome> {
    const at = this.now()
    const counters: readonly LoginBucket[] =
      typeof buckets === 'string' ? [{ key: buckets }] : buckets

    await this.assertNotFiltered({ ip: context.ip })

    const since = new Date(at.getTime() - this.config.lockoutMinutes * 60_000)
    for (const counter of counters) {
      const max = counter.max ?? this.config.maxLoginAttempts
      if (max <= 0) continue
      const failures = await this.store.loginAttempts.countFailuresSince(counter.key, since)
      if (failures >= max) {
        throw new ForbiddenError(msg('error.accounts.too-many-failed-attempts-please'))
      }
    }

    const idLower = foldIdentifier(identifier)
    const account =
      (await this.store.accounts.findByUsernameLower(idLower)) ??
      (await this.store.accounts.findByEmailLower(idLower))

    const encoded = account?.passwordHash ?? (await dummyHash())
    const ok = await verifyPassword(password, encoded)

    const recordFailure = async (): Promise<void> => {
      for (const counter of counters) {
        await this.store.loginAttempts.record(counter.key, false, at)
      }
    }

    if (!account || !ok || account.passwordHash === null) {
      await recordFailure()
      throw new ValidationError(msg('error.accounts.incorrect-username-password'))
    }

    const refusal = await this.signInRefusal(account)
    if (refusal !== null) {
      await recordFailure()
      throw new ForbiddenError(refusal)
    }

    await this.assertNotFiltered({ username: account.username, email: account.email })

    for (const counter of counters) {
      await this.store.loginAttempts.record(counter.key, true, at)
      await this.store.loginAttempts.clear(counter.key)
    }

    if (needsRehash(encoded)) {
      const upgraded = await hashPassword(password)
      await this.store.accounts.updatePassword(account.id, upgraded, PASSWORD_ALGO)
    }

    const prefix = prefixOf(context)
    if (prefix !== null) {
      await this.store.accounts.recordLastIpPrefix(account.id, prefix)
    }

    if (await this.secondFactor?.isEnrolled(account.id)) {
      return {
        status: 'second-factor',
        account,
        ...(await this.holdForSecondFactor(account.id, options.remember === true, at)),
      }
    }

    return { status: 'signed-in', login: await this.startSession(account, at, context) }
  }

  private async holdForSecondFactor(
    userId: number,
    remember: boolean,
    at: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    await this.store.tokens.revokeAllForUser(userId, 'second_factor')

    const token = generateToken()
    const expiresAt = new Date(at.getTime() + SECOND_FACTOR_TTL_MINUTES * 60_000)

    await this.store.tokens.issue({
      tokenHash: await hashToken(token),
      userId,
      purpose: 'second_factor',
      payload: remember ? 'remember' : null,
      expiresAt,
    })

    return { token, expiresAt }
  }

  /**
   * Who a half-finished sign-in belongs to, without spending it — the code can
   * be mistyped, and a member who fumbles it should not have to start from
   * their password again.
   */
  async pendingSecondFactor(token: string): Promise<PendingSecondFactor | null> {
    const held = await this.store.tokens.peek(await hashToken(token), 'second_factor', this.now())
    if (held === null) return null

    return { userId: held.userId, remember: held.payload === 'remember' }
  }

  /** Spends the hold and starts the session it was standing in for. */
  async redeemSecondFactor(token: string, context: RequestContext = {}): Promise<LoginResult> {
    const at = this.now()
    const redeemed = await this.store.tokens.consume(await hashToken(token), 'second_factor', at)

    if (redeemed === null) {
      throw new ForbiddenError(msg('error.accounts.sign-in-took-too-long-finish'))
    }

    const account = await this.store.accounts.findById(redeemed.userId)
    if (account === null) throw new ForbiddenError(msg('error.accounts.account-longer-exists'))

    await this.assertSignInAllowed(account)
    return this.startSession(account, at, context)
  }

  async abandonSecondFactor(userId: number): Promise<void> {
    await this.store.tokens.revokeAllForUser(userId, 'second_factor')
  }

  /**
   * The second step gets its own counter. The password counters were cleared
   * when the password proved out, and a six-digit code is worth a million
   * guesses — far fewer than a password, and so worth far less patience.
   */
  async assertSecondFactorAttemptsLeft(userId: number): Promise<void> {
    const max = this.config.maxLoginAttempts
    if (max <= 0) return

    const since = new Date(this.now().getTime() - this.config.lockoutMinutes * 60_000)
    const failures = await this.store.loginAttempts.countFailuresSince(
      secondFactorBucket(userId),
      since,
    )

    if (failures >= max) {
      throw new ForbiddenError(msg('error.accounts.too-many-wrong-codes-please'))
    }
  }

  async recordSecondFactorFailure(userId: number): Promise<void> {
    await this.store.loginAttempts.record(secondFactorBucket(userId), false, this.now())
  }

  async clearSecondFactorFailures(userId: number): Promise<void> {
    await this.store.loginAttempts.clear(secondFactorBucket(userId))
  }

  private async signInRefusal(account: AccountRecord): Promise<string | null> {
    const ban = await this.bans?.findActive(account.id)
    if (ban || account.state === 'banned') {
      return ban?.publicReason
        ? `This account is banned: ${ban.publicReason}`
        : 'This account is banned.'
    }
    if (account.state === 'awaiting_activation') {
      return 'This account is not yet activated.'
    }
    return null
  }

  async assertSignInAllowed(account: AccountRecord): Promise<void> {
    const refusal = await this.signInRefusal(account)
    if (refusal !== null) throw new ForbiddenError(refusal)

    await this.assertNotFiltered({ username: account.username, email: account.email })
  }

  async startSessionFor(
    account: AccountRecord,
    context: RequestContext = {},
  ): Promise<LoginResult> {
    await this.assertSignInAllowed(account)

    const prefix = prefixOf(context)
    if (prefix !== null) {
      await this.store.accounts.recordLastIpPrefix(account.id, prefix)
    }

    return this.startSession(account, this.now(), context)
  }

  private async assertNotFiltered(subject: BanFilterSubject): Promise<void> {
    if (!this.banFilters) return

    const match = matchBanFilter(await this.banFilters.listAll(), subject)
    if (match) {
      throw new ForbiddenError(msg('error.accounts.account-used-board-contact-administrator'))
    }
  }

  async logout(sessionToken: string): Promise<void> {
    const session = await this.store.sessions.findByTokenHash(await hashToken(sessionToken))
    if (session) await this.store.sessions.revoke(session.id)
  }

  async resolveSession(sessionToken: string): Promise<{ userId: number } | null> {
    const located = await this.locateSession(sessionToken)
    if (located === null) return null
    return { userId: located.userId }
  }

  async locateSession(sessionToken: string): Promise<{ sessionId: number; userId: number } | null> {
    const session = await this.store.sessions.findByTokenHash(await hashToken(sessionToken))
    if (!session) return null
    if (session.revokedAt !== null) return null
    if (session.expiresAt.getTime() <= this.now().getTime()) return null
    return { sessionId: session.id, userId: session.userId }
  }

  async requestPasswordReset(email: string): Promise<ResetRequest> {
    const account = await this.store.accounts.findByEmailLower(foldIdentifier(email))
    if (!account) return { token: null, userId: null }

    await this.store.tokens.revokeAllForUser(account.id, 'password_reset')

    const token = generateToken()
    await this.store.tokens.issue({
      tokenHash: await hashToken(token),
      userId: account.id,
      purpose: 'password_reset',
      expiresAt: new Date(this.now().getTime() + this.config.resetTokenTtlMinutes * 60_000),
    })
    return { token, userId: account.id }
  }

  async redeemPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<{ readonly userId: number }> {
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
      throw new ValidationError(msg('error.accounts.reset-link-invalid-expired'))
    }

    const encoded = await hashPassword(newPassword)
    await this.store.accounts.updatePassword(redeemed.userId, encoded, PASSWORD_ALGO)
    await this.store.sessions.revokeAllForUser(redeemed.userId)

    return { userId: redeemed.userId }
  }

  private async startSession(
    account: AccountRecord,
    at: Date,
    context: RequestContext = {},
  ): Promise<LoginResult> {
    const token = generateToken()
    const expiresAt = new Date(at.getTime() + this.config.sessionLifetimeDays * 86_400_000)
    await this.store.sessions.create({
      tokenHash: await hashToken(token),
      userId: account.id,
      expiresAt,
      ipPrefix: prefixOf(context),
      userAgent: context.userAgent ?? null,
    })
    return { account, sessionToken: token, expiresAt }
  }

  private assertUsername(username: string, usernameLower: string): void {
    const length = codePointLength(username)
    if (length < this.config.usernameMin || length > this.config.usernameMax) {
      throw new ValidationError(
        `Username must be between ${this.config.usernameMin} and ${this.config.usernameMax} characters.`,
        {},
        { meta: { field: REGISTER_FIELD.username } },
      )
    }
    if (!USERNAME_RE.test(username)) {
      throw new ValidationError(
        msg('error.accounts.username-contains-invalid-characters'),
        {},
        {
          meta: { field: REGISTER_FIELD.username },
        },
      )
    }
    if (this.config.reservedUsernames.includes(usernameLower)) {
      throw new ConflictError(msg('error.accounts.username-reserved-pick-another-board'), {
        meta: { field: REGISTER_FIELD.username },
      })
    }
  }

  private assertEmail(email: string): void {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError(
        msg('error.accounts.please-enter-valid-email-address'),
        {},
        {
          meta: { field: REGISTER_FIELD.email },
        },
      )
    }
  }
}

function secondFactorBucket(userId: number): string {
  return `second-factor:${userId}`
}

function codePointLength(value: string): number {
  return [...value].length
}

function trimToLength(value: string, max: number): string {
  return [...value].slice(0, Math.max(max, 1)).join('').trim()
}

function prefixOf(context: RequestContext): string | null {
  const prefix = context.ipPrefix
  if (prefix === undefined || prefix === null) return null
  const value = prefix.trim()
  return value === '' ? null : value
}

let dummyHashPromise: Promise<string> | null = null
function dummyHash(): Promise<string> {
  if (dummyHashPromise === null) {
    dummyHashPromise = hashPassword(generateToken())
  }
  return dummyHashPromise
}

const PASSWORD_ALGO = 'argon2id'
