/**
 * Repository ports for identity (F17–F19).
 *
 * Declared here in the domain package; implemented twice — Postgres in
 * `@forum/db`, in-memory in `./memory` for fixture mode and tests. The service
 * in `./service` depends only on these interfaces, so the same register/login/
 * reset logic runs identically against a database and against a Map.
 */

/** Lifecycle state persisted on the user row. */
export type AccountState = 'active' | 'awaiting_activation' | 'banned'

/** The subset of the users row identity needs. Not the whole profile. */
export interface AccountRecord {
  readonly id: number
  readonly username: string
  readonly usernameLower: string
  readonly email: string
  readonly emailLower: string
  /** null for passwordless (legacy/OAuth) accounts. */
  readonly passwordHash: string | null
  readonly passwordAlgo: string | null
  readonly state: AccountState
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
}

export interface AccountRepository {
  findById(id: number): Promise<AccountRecord | null>
  findByUsernameLower(usernameLower: string): Promise<AccountRecord | null>
  findByEmailLower(emailLower: string): Promise<AccountRecord | null>
  create(input: NewAccount): Promise<AccountRecord>
  /** Replace the credential and record which algorithm produced it (F17 upgrade). */
  updatePassword(userId: number, passwordHash: string, passwordAlgo: string): Promise<void>
  setState(userId: number, state: AccountState): Promise<void>
}

export interface SessionRecord {
  readonly id: number
  readonly userId: number
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  /** Non-null once a login superseded this row (fixation defence, F17). */
  readonly supersededBySessionId: number | null
  readonly lastSeenAt: Date
}

/** The R3.1 `sessions.location_*` triplet, written at most once per 60s (F17). */
export interface SessionLocation {
  readonly path: string | null
  readonly forumId: number | null
  readonly threadId: number | null
}

export interface SessionRepository {
  /** Persist a session keyed by the token *hash*; the plaintext never reaches storage. */
  create(input: {
    tokenHash: string
    userId: number
    expiresAt: Date
  }): Promise<SessionRecord>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  revoke(sessionId: number): Promise<void>
  /** Revoke every live session for a user (password reset, forced logout). */
  revokeAllForUser(userId: number): Promise<void>
  /**
   * Session-fixation defence: point `oldSessionId` at its replacement and revoke
   * it in the same write, so an in-flight request sees a coherent superseded row
   * rather than a half-rotated one.
   */
  supersede(oldSessionId: number, newSessionId: number, now: Date): Promise<void>
  /**
   * Update the location columns (and `last_seen_at`) **iff** the previous write
   * was more than `windowSeconds` ago. Returns true iff a row was actually
   * written. The throttle is a property of this method (a conditional UPDATE),
   * not of the caller — two calls inside the window write once.
   */
  touchLocation(
    sessionId: number,
    location: SessionLocation,
    now: Date,
    windowSeconds: number,
  ): Promise<boolean>
}

/** Outcome of presenting a remember-me token for rotation. */
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
  /**
   * Present a remember token to obtain a fresh one, atomically:
   *  - valid, unused, unexpired, unrevoked → mark it used, insert `nextHash` in
   *    the same family, return `rotated`.
   *  - the token exists but is already used or revoked → `reuse`. The token was
   *    replayed; the caller must revoke the whole family.
   *  - not found or expired → `invalid`.
   * Single-use is enforced inside the write, so a stolen token and the real
   * client cannot both rotate it.
   */
  rotate(input: {
    presentedHash: string
    nextHash: string
    now: Date
    nextExpiresAt: Date
  }): Promise<RememberRotation>
  /** Revoke every token in a family (reuse detected, or explicit logout-all). */
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
  /**
   * Atomically redeem a token: return `{ userId, payload }` and mark it consumed
   * **iff** it is unconsumed and unexpired, otherwise return null. Single-use is
   * a property of this method, not of the caller — a second call returns null.
   */
  consume(
    tokenHash: string,
    purpose: CredentialPurpose,
    now: Date,
  ): Promise<{ userId: number; payload: string | null } | null>
  revokeAllForUser(userId: number, purpose: CredentialPurpose): Promise<void>
}

export interface LoginAttemptRepository {
  record(bucket: string, succeeded: boolean, at: Date): Promise<void>
  /** Count *failed* attempts in a bucket since `since` — the lockout numerator. */
  countFailuresSince(bucket: string, since: Date): Promise<number>
  /** Drop a bucket's history, called on successful login. */
  clear(bucket: string): Promise<void>
}

/** Everything the service needs from the settings registry, injected by the caller. */
export interface AuthConfig {
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  /** 0 disables lockout. */
  readonly maxLoginAttempts: number
  readonly lockoutMinutes: number
  readonly sessionIdleDays: number
  readonly resetTokenTtlMinutes: number
  /** Lower-cased names that may not be registered. */
  readonly reservedUsernames: readonly string[]
  /** Group new members land in. */
  readonly defaultMemberGroupId: number
}

/** Injectable clock so time-based logic (lockout window, expiry) is testable. */
export type Clock = () => Date

/** The repositories the identity service operates over. */
export interface AccountStore {
  readonly accounts: AccountRepository
  readonly sessions: SessionRepository
  readonly tokens: CredentialTokenRepository
  readonly loginAttempts: LoginAttemptRepository
  readonly remember: RememberTokenRepository
}
