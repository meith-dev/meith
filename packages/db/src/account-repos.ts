import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

import type {
  AccountRecord,
  AccountRepository,
  AccountState,
  AccountStore,
  CredentialPurpose,
  CredentialTokenRepository,
  LoginAttemptRepository,
  NewAccount,
  RememberRotation,
  RememberTokenRepository,
  SessionLocation,
  SessionRecord,
  SessionRepository,
} from '@meith/accounts'

import type { Database } from './client'
import {
  PostgresPasskeyRepository,
  PostgresUserIdentityRepository,
} from './identity-link-repo'
import { resultRows } from './result-rows'
import {
  credentialTokens,
  loginAttempts,
  rememberTokens,
  sessions,
  users,
} from './schema'

function toAccountRecord(row: {
  id: number
  username: string
  usernameLower: string
  email: string
  emailLower: string
  passwordHash: string | null
  passwordAlgo: string | null
  state: string
  emailVerifiedAt: Date | null
  primaryGroupId: number | null
}): AccountRecord {
  return {
    id: row.id,
    username: row.username,
    usernameLower: row.usernameLower,
    email: row.email,
    emailLower: row.emailLower,
    passwordHash: row.passwordHash,
    passwordAlgo: row.passwordAlgo,
    state: row.state as AccountState,
    emailVerifiedAt: row.emailVerifiedAt,
    // eslint-disable-next-line no-restricted-properties -- reading a column to transport into the record, not a decision
    primaryGroupId: row.primaryGroupId,
  }
}

const ACCOUNT_COLUMNS = {
  id: users.id,
  username: users.username,
  usernameLower: users.usernameLower,
  email: users.email,
  emailLower: users.emailLower,
  passwordHash: users.passwordHash,
  passwordAlgo: users.passwordAlgo,
  state: users.state,
  emailVerifiedAt: users.emailVerifiedAt,
  // eslint-disable-next-line no-restricted-properties -- selecting a column to transport, not a decision
  primaryGroupId: users.primaryGroupId,
} as const

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Database) {}

  async findById(id: number): Promise<AccountRecord | null> {
    const rows = await this.db
      .select(ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    return rows[0] ? toAccountRecord(rows[0]) : null
  }

  async findByUsernameLower(usernameLower: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select(ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.usernameLower, usernameLower))
      .limit(1)
    return rows[0] ? toAccountRecord(rows[0]) : null
  }

  async findByEmailLower(emailLower: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select(ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.emailLower, emailLower))
      .limit(1)
    return rows[0] ? toAccountRecord(rows[0]) : null
  }

  async create(input: NewAccount): Promise<AccountRecord> {
    const rows = await this.db
      .insert(users)
      .values({
        username: input.username,
        usernameLower: input.usernameLower,
        email: input.email,
        emailLower: input.emailLower,
        passwordHash: input.passwordHash,
        passwordAlgo: input.passwordAlgo,
        state: input.state,
        // eslint-disable-next-line no-restricted-properties -- writing the persisted column, not a decision
        primaryGroupId: input.primaryGroupId,
        registrationIpPrefix: input.registrationIpPrefix ?? null,
      })
      .returning(ACCOUNT_COLUMNS)
    return toAccountRecord(rows[0]!)
  }

  async recordLastIpPrefix(userId: number, prefix: string): Promise<void> {
    await this.db.update(users).set({ lastIpPrefix: prefix }).where(eq(users.id, userId))
  }

  async updatePassword(
    userId: number,
    passwordHash: string,
    passwordAlgo: string,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, passwordAlgo, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))
  }

  async setState(userId: number, state: AccountState): Promise<void> {
    await this.db.update(users).set({ state }).where(eq(users.id, userId))
  }

  async markEmailVerified(
    userId: number,
    at: Date,
    activate: boolean,
  ): Promise<AccountState | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        with before as (
          select id, state from users where id = ${userId} for update
        )
        update users u
           set email_verified_at = coalesce(u.email_verified_at, ${at}),
               state = case
                         when ${activate}::boolean and b.state = 'awaiting_activation'
                           then 'active'
                         else u.state
                       end,
               updated_at = now()
          from before b
         where u.id = b.id
        returning b.state as previous_state
      `),
    ) as Array<{ previous_state: string }>

    const previous = rows[0]?.previous_state
    return previous === undefined ? null : (previous as AccountState)
  }

  async touchLastActive(userId: number, now: Date, windowSeconds: number): Promise<boolean> {
    const cutoff = new Date(now.getTime() - windowSeconds * 1000)
    const rows = await this.db
      .update(users)
      .set({ lastActiveAt: now })
      .where(
        and(
          eq(users.id, userId),
          or(isNull(users.lastActiveAt), lt(users.lastActiveAt, cutoff)),
        ),
      )
      .returning({ id: users.id })
    return rows.length > 0
  }
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tokenHash: string
    userId: number
    expiresAt: Date
  }): Promise<SessionRecord> {
    const rows = await this.db
      .insert(sessions)
      .values({
        tokenHash: input.tokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt,
      })
      .returning(SESSION_COLUMNS)
    return toSessionRecord(rows[0]!)
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select(SESSION_COLUMNS)
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
    const row = rows[0]
    if (!row || row.userId === null) return null
    return toSessionRecord(row)
  }

  async revoke(sessionId: number): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId))
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  }

  async supersede(oldSessionId: number, newSessionId: number, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ supersededBySessionId: newSessionId, revokedAt: now })
      .where(and(eq(sessions.id, oldSessionId), isNull(sessions.revokedAt)))
  }

  async touchLocation(
    sessionId: number,
    location: SessionLocation,
    now: Date,
    windowSeconds: number,
  ): Promise<boolean> {
    const cutoff = new Date(now.getTime() - windowSeconds * 1000)
    const rows = await this.db
      .update(sessions)
      .set({
        locationPath: location.path,
        locationForumId: location.forumId,
        locationThreadId: location.threadId,
        lastSeenAt: now,
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          lt(sessions.lastSeenAt, cutoff),
        ),
      )
      .returning({ id: sessions.id })
    return rows.length > 0
  }
}

const SESSION_COLUMNS = {
  id: sessions.id,
  userId: sessions.userId,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
  supersededBySessionId: sessions.supersededBySessionId,
  lastSeenAt: sessions.lastSeenAt,
} as const

function toSessionRecord(row: {
  id: number
  userId: number | null
  expiresAt: Date
  revokedAt: Date | null
  supersededBySessionId: number | null
  lastSeenAt: Date
}): SessionRecord {
  return {
    id: row.id,
    userId: row.userId!,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    supersededBySessionId: row.supersededBySessionId,
    lastSeenAt: row.lastSeenAt,
  }
}

export class PostgresCredentialTokenRepository
  implements CredentialTokenRepository
{
  constructor(private readonly db: Database) {}

  async issue(input: {
    tokenHash: string
    userId: number
    purpose: CredentialPurpose
    payload?: string | null
    expiresAt: Date
  }): Promise<void> {
    await this.db.insert(credentialTokens).values({
      tokenHash: input.tokenHash,
      userId: input.userId,
      purpose: input.purpose,
      payload: input.payload ?? null,
      expiresAt: input.expiresAt,
    })
  }

  async consume(
    tokenHash: string,
    purpose: CredentialPurpose,
    now: Date,
  ): Promise<{ userId: number; payload: string | null } | null> {
    const rows = await this.db
      .update(credentialTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(credentialTokens.tokenHash, tokenHash),
          eq(credentialTokens.purpose, purpose),
          isNull(credentialTokens.consumedAt),
          gt(credentialTokens.expiresAt, now),
        ),
      )
      .returning({
        userId: credentialTokens.userId,
        payload: credentialTokens.payload,
      })
    const row = rows[0]
    return row ? { userId: row.userId, payload: row.payload } : null
  }

  async revokeAllForUser(
    userId: number,
    purpose: CredentialPurpose,
  ): Promise<void> {
    await this.db
      .update(credentialTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(credentialTokens.userId, userId),
          eq(credentialTokens.purpose, purpose),
          isNull(credentialTokens.consumedAt),
        ),
      )
  }
}

export class PostgresLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly db: Database) {}

  async record(bucket: string, succeeded: boolean, at: Date): Promise<void> {
    await this.db
      .insert(loginAttempts)
      .values({ bucket, succeeded, occurredAt: at })
  }

  async countFailuresSince(bucket: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ id: loginAttempts.id })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.bucket, bucket),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.occurredAt, since),
        ),
      )
    return rows.length
  }

  async clear(bucket: string): Promise<void> {
    await this.db.delete(loginAttempts).where(eq(loginAttempts.bucket, bucket))
  }
}

export class PostgresRememberTokenRepository implements RememberTokenRepository {
  constructor(private readonly db: Database) {}

  async issue(input: {
    tokenHash: string
    familyId: string
    userId: number
    expiresAt: Date
  }): Promise<void> {
    await this.db.insert(rememberTokens).values({
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      userId: input.userId,
      expiresAt: input.expiresAt,
    })
  }

  async rotate(input: {
    presentedHash: string
    nextHash: string
    now: Date
    nextExpiresAt: Date
  }): Promise<RememberRotation> {
    const claimed = await this.db
      .update(rememberTokens)
      .set({ usedAt: input.now })
      .where(
        and(
          eq(rememberTokens.tokenHash, input.presentedHash),
          isNull(rememberTokens.usedAt),
          isNull(rememberTokens.revokedAt),
          gt(rememberTokens.expiresAt, input.now),
        ),
      )
      .returning({ familyId: rememberTokens.familyId, userId: rememberTokens.userId })

    if (claimed[0]) {
      const { familyId, userId } = claimed[0]
      await this.db.insert(rememberTokens).values({
        tokenHash: input.nextHash,
        familyId,
        userId,
        expiresAt: input.nextExpiresAt,
      })
      return { status: 'rotated', userId, familyId }
    }

    const existing = await this.db
      .select({
        familyId: rememberTokens.familyId,
        userId: rememberTokens.userId,
        expiresAt: rememberTokens.expiresAt,
      })
      .from(rememberTokens)
      .where(eq(rememberTokens.tokenHash, input.presentedHash))
      .limit(1)

    const row = existing[0]
    if (!row || row.expiresAt.getTime() <= input.now.getTime()) {
      return { status: 'invalid' }
    }
    return { status: 'reuse', userId: row.userId, familyId: row.familyId }
  }

  async revokeFamily(familyId: string, reason: string, now: Date): Promise<void> {
    await this.db
      .update(rememberTokens)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(eq(rememberTokens.familyId, familyId), isNull(rememberTokens.revokedAt)))
  }

  async findByTokenHash(tokenHash: string): Promise<{
    familyId: string
    userId: number
    usedAt: Date | null
    revokedAt: Date | null
  } | null> {
    const rows = await this.db
      .select({
        familyId: rememberTokens.familyId,
        userId: rememberTokens.userId,
        usedAt: rememberTokens.usedAt,
        revokedAt: rememberTokens.revokedAt,
      })
      .from(rememberTokens)
      .where(eq(rememberTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }
}

export function createPostgresAccountStore(db: Database): AccountStore {
  return {
    accounts: new PostgresAccountRepository(db),
    sessions: new PostgresSessionRepository(db),
    tokens: new PostgresCredentialTokenRepository(db),
    loginAttempts: new PostgresLoginAttemptRepository(db),
    remember: new PostgresRememberTokenRepository(db),
    identities: new PostgresUserIdentityRepository(db),
    passkeys: new PostgresPasskeyRepository(db),
  }
}
