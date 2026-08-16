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
  readonly passwordHash: string
  readonly passwordAlgo: string
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
  readonly lastSeenAt: Date
}

export interface SessionLocation {
  readonly path: string | null
  readonly forumId: number | null
  readonly threadId: number | null
}

export interface SessionRepository {
  create(input: {
    tokenHash: string
    userId: number
    expiresAt: Date
  }): Promise<SessionRecord>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  revoke(sessionId: number): Promise<void>
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
  revokeAllForUser(userId: number, purpose: CredentialPurpose): Promise<void>
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
