import type { BanFilter } from './ban-filter'

export type AccountState = 'active' | 'awaiting_activation' | 'banned'

export interface AccountRecord {
  readonly id: number
  readonly username: string
  readonly usernameLower: string
  readonly email: string
  readonly emailLower: string
  readonly passwordHash: string | null
  readonly passwordAlgo: string | null
  readonly state: AccountState
  readonly emailVerifiedAt: Date | null
  readonly primaryGroupId: number | null
}

export interface NewAccount {
  readonly username: string
  readonly usernameLower: string
  readonly email: string
  readonly emailLower: string
  readonly passwordHash: string | null
  readonly passwordAlgo: string | null
  readonly state: AccountState
  readonly primaryGroupId: number
  readonly registrationIpPrefix?: string | null
}

export interface AccountRepository {
  findById(id: number): Promise<AccountRecord | null>
  findByUsernameLower(usernameLower: string): Promise<AccountRecord | null>
  findByEmailLower(emailLower: string): Promise<AccountRecord | null>
  create(input: NewAccount): Promise<AccountRecord>
  updatePassword(userId: number, passwordHash: string, passwordAlgo: string): Promise<void>
  setState(userId: number, state: AccountState): Promise<void>
  markEmailVerified(userId: number, at: Date, activate: boolean): Promise<AccountState | null>
  touchLastActive(userId: number, now: Date, windowSeconds: number): Promise<boolean>
  recordLastIpPrefix(userId: number, prefix: string): Promise<void>
}

export interface MemberProfileRecord {
  readonly id: number
  readonly username: string
  readonly title: string | null
  readonly postCount: number
  readonly createdAt: Date
  readonly lastActiveAt: Date | null
  readonly location: string | null
  readonly website: string | null
  readonly bio: string | null
}

export interface MemberProfileRepository {
  findPublicById(id: number): Promise<MemberProfileRecord | null>
}

export interface SessionRecord {
  readonly id: number
  readonly userId: number
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  readonly supersededBySessionId: number | null
  readonly credentialProvedAt: Date | null
  readonly lastSeenAt: Date
}

export interface SessionLocation {
  readonly path: string | null
  readonly forumId: number | null
  readonly threadId: number | null
}

export interface ActiveSessionRecord {
  readonly id: number
  readonly createdAt: Date
  readonly lastSeenAt: Date
  readonly expiresAt: Date
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}

export interface SessionRepository {
  create(input: {
    tokenHash: string
    userId: number
    expiresAt: Date
    ipPrefix?: string | null
    userAgent?: string | null
  }): Promise<SessionRecord>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  markCredentialProved(sessionId: number, userId: number, at: Date): Promise<boolean>
  listActiveForUser(userId: number, now: Date): Promise<readonly ActiveSessionRecord[]>
  revoke(sessionId: number): Promise<void>
  revokeOwned(userId: number, sessionId: number, now: Date): Promise<boolean>
  revokeAllForUserExcept(userId: number, sessionId: number | null): Promise<number>
  revokeAllForUser(userId: number): Promise<void>
  supersede(oldSessionId: number, newSessionId: number, now: Date): Promise<void>
  touchLocation(
    sessionId: number,
    location: SessionLocation,
    now: Date,
    windowSeconds: number,
  ): Promise<boolean>
}

export type RememberRotation =
  | { readonly status: 'rotated'; readonly userId: number; readonly familyId: string }
  | { readonly status: 'reuse'; readonly userId: number; readonly familyId: string }
  | { readonly status: 'invalid' }

/**
 * How long after a remember token is rotated its old value is still honoured.
 *
 * Rotation is single-use, and two requests carrying the same cookie arrive
 * whenever a browser restores several tabs at once, a link is double-clicked, or
 * a prefetch races the navigation that prompted it. Exactly one wins the claim;
 * without this window the others are indistinguishable from a stolen token and
 * cost the member every session they hold. Real theft reuses a token long after
 * the fact, not inside the same breath.
 */
export const REMEMBER_ROTATION_GRACE_SECONDS = 30

/**
 * Whether a spent remember token is a concurrent request rather than a theft.
 *
 * A revoked family is always theft: the board has already decided about it.
 * Elapsed time is not required to be positive — requests racing each other
 * stamp `now` on the way in, so the one that loses the claim can carry a
 * timestamp from just before the winner wrote `usedAt`, which is the very case
 * this window exists to forgive.
 */
export function withinRotationGrace(
  row: { readonly usedAt: Date | null; readonly revokedAt: Date | null },
  now: Date,
): boolean {
  if (row.revokedAt !== null || row.usedAt === null) return false

  return now.getTime() - row.usedAt.getTime() <= REMEMBER_ROTATION_GRACE_SECONDS * 1_000
}

export interface RememberTokenRepository {
  issue(input: {
    tokenHash: string
    familyId: string
    userId: number
    expiresAt: Date
  }): Promise<void>
  rotate(input: {
    presentedHash: string
    nextHash: string
    now: Date
    nextExpiresAt: Date
  }): Promise<RememberRotation>
  revokeFamily(familyId: string, reason: string, now: Date): Promise<void>
  revokeAllForUser(userId: number, reason: string, now: Date): Promise<void>
  findByTokenHash(tokenHash: string): Promise<{
    familyId: string
    userId: number
    usedAt: Date | null
    revokedAt: Date | null
  } | null>
}

export type CredentialPurpose =
  | 'password_reset'
  | 'email_verification'
  | 'email_change'
  | 'second_factor'

export interface CredentialTokenRepository {
  issue(input: {
    tokenHash: string
    userId: number
    purpose: CredentialPurpose
    payload?: string | null
    expiresAt: Date
  }): Promise<void>
  consume(
    tokenHash: string,
    purpose: CredentialPurpose,
    now: Date,
  ): Promise<{ userId: number; payload: string | null } | null>
  /**
   * The same lookup without spending the token. A half-finished sign-in has to
   * survive a mistyped code, so the token that carries it is only consumed once
   * the second factor is actually satisfied.
   */
  peek(
    tokenHash: string,
    purpose: CredentialPurpose,
    now: Date,
  ): Promise<{ userId: number; payload: string | null } | null>
  revokeAllForUser(userId: number, purpose: CredentialPurpose): Promise<void>
}

export interface UserIdentityRecord {
  readonly id: number
  readonly userId: number
  readonly provider: string
  readonly subject: string
  readonly label: string | null
  readonly linkedAt: Date
  readonly lastUsedAt: Date | null
}

export interface LinkIdentityInput {
  readonly userId: number
  readonly provider: string
  readonly subject: string
  readonly label: string | null
  readonly now: Date
}

export interface UserIdentityRepository {
  findBySubject(provider: string, subject: string): Promise<UserIdentityRecord | null>
  listForUser(userId: number): Promise<readonly UserIdentityRecord[]>
  link(input: LinkIdentityInput): Promise<UserIdentityRecord>
  unlink(userId: number, identityId: number): Promise<boolean>
  markUsed(identityId: number, now: Date): Promise<void>
}

export interface PasskeyRecord {
  readonly id: number
  readonly userId: number
  readonly credentialId: string
  readonly publicKey: string
  readonly signCount: number
  readonly label: string
  readonly transports: string | null
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
}

export interface NewPasskey {
  readonly userId: number
  readonly credentialId: string
  readonly publicKey: string
  readonly signCount: number
  readonly label: string
  readonly transports: string | null
  readonly now: Date
}

export interface PasskeyRepository {
  findByCredentialId(credentialId: string): Promise<PasskeyRecord | null>
  listForUser(userId: number): Promise<readonly PasskeyRecord[]>
  create(input: NewPasskey): Promise<PasskeyRecord>
  remove(userId: number, passkeyId: number): Promise<boolean>
  markUsed(passkeyId: number, signCount: number, now: Date): Promise<void>
}

export interface TwoFactorRecord {
  readonly userId: number
  readonly sealedSecret: string
  readonly confirmedAt: Date | null
  readonly lastStep: number | null
  readonly createdAt: Date
}

export interface TwoFactorRepository {
  find(userId: number): Promise<TwoFactorRecord | null>
  startEnrolment(input: {
    userId: number
    sealedSecret: string
    now: Date
  }): Promise<TwoFactorRecord>
  confirm(userId: number, step: number, now: Date): Promise<boolean>
  /** False when the step has already been spent, which is a replayed code. */
  spendStep(userId: number, step: number): Promise<boolean>
  remove(userId: number): Promise<boolean>
}

export interface RecoveryCodeRepository {
  replaceAll(userId: number, hashes: readonly string[], now: Date): Promise<void>
  spend(userId: number, hash: string, now: Date): Promise<boolean>
  countUnused(userId: number): Promise<number>
  removeAll(userId: number): Promise<void>
}

export const AUTH_EVENT_KINDS = [
  'login',
  'login_failed',
  'logout',
  'second_factor_failed',
  'second_factor_enabled',
  'second_factor_disabled',
  'second_factor_cleared',
  'recovery_code_used',
  'recovery_codes_replaced',
  'password_changed',
  'password_reset',
  'email_change_requested',
  'email_changed',
  'session_revoked',
  'sessions_revoked',
  'identity_linked',
  'identity_unlinked',
  'passkey_added',
  'passkey_removed',
] as const

export type AuthEventKind = (typeof AUTH_EVENT_KINDS)[number]

export interface AuthEventRecord {
  readonly id: number
  readonly userId: number | null
  readonly kind: AuthEventKind
  readonly ipPrefix: string | null
  readonly userAgent: string | null
  readonly detail: Readonly<Record<string, unknown>>
  readonly at: Date
}

export interface NewAuthEvent {
  readonly userId: number | null
  readonly kind: AuthEventKind
  readonly ipPrefix?: string | null
  readonly userAgent?: string | null
  readonly detail?: Readonly<Record<string, unknown>>
  readonly at: Date
}

export interface AuthEventRepository {
  record(event: NewAuthEvent): Promise<void>
  listForUser(userId: number, limit: number): Promise<readonly AuthEventRecord[]>
  listRecent(input: {
    limit: number
    before?: number | undefined
    kind?: AuthEventKind | undefined
  }): Promise<readonly AuthEventRecord[]>
  pruneBefore(cutoff: Date, limit?: number): Promise<number>
}

export interface LoginAttemptRepository {
  record(bucket: string, succeeded: boolean, at: Date): Promise<void>
  countFailuresSince(bucket: string, since: Date): Promise<number>
  clear(bucket: string): Promise<void>
}

export interface LoginBucket {
  readonly key: string
  readonly max?: number | undefined
}

export interface AuthConfig {
  readonly registrationEnabled: boolean
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  readonly maxLoginAttempts: number
  readonly maxAccountLoginAttempts: number
  readonly lockoutMinutes: number
  readonly sessionLifetimeDays: number
  readonly resetTokenTtlMinutes: number
  readonly reservedUsernames: readonly string[]
  readonly defaultMemberGroupId: number
}

export type Clock = () => Date

export interface AccountStore {
  readonly accounts: AccountRepository
  readonly sessions: SessionRepository
  readonly tokens: CredentialTokenRepository
  readonly loginAttempts: LoginAttemptRepository
  readonly remember: RememberTokenRepository
  readonly identities: UserIdentityRepository
  readonly passkeys: PasskeyRepository
  readonly twoFactor: TwoFactorRepository
  readonly recoveryCodes: RecoveryCodeRepository
  readonly authEvents: AuthEventRepository
}

export interface BanRecord {
  readonly id: number
  readonly userId: number
  readonly reason: string | null
  readonly publicReason: string | null
  readonly previousPrimaryGroupId: number | null
  readonly expiresAt: Date | null
  readonly liftedAt: Date | null
}

export interface CreateBanInput {
  readonly userId: number
  readonly bannedByUserId: number | null
  readonly reason: string | null
  readonly publicReason: string | null
  readonly expiresAt: Date | null
  readonly bannedGroupId: number
  readonly now: Date
}

export interface BanRepository {
  findActive(userId: number): Promise<BanRecord | null>

  create(input: CreateBanInput): Promise<BanRecord>

  lift(banId: number, now: Date): Promise<void>

  expireDue(now: Date, limit: number): Promise<number>
}

export interface BanFilterRepository {
  listAll(): Promise<readonly BanFilter[]>
}
