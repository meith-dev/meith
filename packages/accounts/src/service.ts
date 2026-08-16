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
  readonly clock?: Clock
  readonly banFilters?: BanFilterRepository
  readonly bans?: BanLookup
}

export interface BanLookup {
  findActive(userId: number): Promise<BanRecord | null>
}

export interface RequestContext {
  readonly ip?: string | undefined
  readonly ipPrefix?: string | null | undefined
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

export interface ResendVerification {
  readonly token: string | null
  readonly account: AccountRecord | null
}

const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

export const REGISTRATION_CLOSED =
  'This board is not taking new members at the moment.'

export class IdentityService {
  private readonly store: AccountStore
  private readonly config: AuthConfig
  private readonly now: Clock

  private readonly banFilters: BanFilterRepository | undefined

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
      registrationIpPrefix: prefixOf(context),
    })

    if (this.verifiesEmail()) {
      return { account, verificationToken: await this.issueVerification(account.id) }
    }

    return { account }
  }

  private verifiesEmail(): boolean {
    return (
      this.config.activationMethod === 'email' ||
      this.config.activationMethod === 'both'
    )
  }

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

    if (previous === null) return 'invalid'
    if (previous === 'banned') return 'banned'
    if (previous === 'active') return 'already-active'
    return needsApproval ? 'awaiting-approval' : 'activated'
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
  ): Promise<LoginResult> {
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
        throw new ForbiddenError(
          'Too many failed attempts. Please wait before trying again.',
        )
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
      throw new ValidationError('Incorrect username or password.')
    }

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

    return this.startSession(account, at)
  }

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

  async resolveSession(sessionToken: string): Promise<{ userId: number } | null> {
    const located = await this.locateSession(sessionToken)
    if (located === null) return null
    return { userId: located.userId }
  }

  async locateSession(
    sessionToken: string,
  ): Promise<{ sessionId: number; userId: number } | null> {
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
    await this.store.sessions.revokeAllForUser(redeemed.userId)
  }

  private async startSession(account: AccountRecord, at: Date): Promise<LoginResult> {
    const token = generateToken()
    const expiresAt = new Date(at.getTime() + this.config.sessionLifetimeDays * 86_400_000)
    await this.store.sessions.create({
      tokenHash: await hashToken(token),
      userId: account.id,
      expiresAt,
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError('Please enter a valid email address.', {}, {
        meta: { field: REGISTER_FIELD.email },
      })
    }
  }
}

function codePointLength(value: string): number {
  return [...value].length
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
