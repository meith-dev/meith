/**
 * Postgres adapters for the four identity ports declared in `@forum/accounts`.
 *
 * The domain (`@forum/accounts`) owns the interfaces; this is their SQL
 * implementation, so the same `IdentityService` runs over Postgres here and over
 * the in-memory store in tests. Infrastructure depends on the domain interface,
 * never the reverse.
 *
 * The one method with a genuine concurrency hazard is `CredentialToken.consume`:
 * single-use must survive two requests racing on the same token. It is written
 * as a *conditional UPDATE ... RETURNING* — the `consumed_at IS NULL` predicate
 * is evaluated inside the write, so exactly one of two concurrent redemptions
 * gets a row back and the other gets nothing. A read-then-write would let both
 * observe "unconsumed" and both succeed; that bug is designed out here.
 */
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm'

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
} from '@forum/accounts'

import type { Database } from './client'
import {
  credentialTokens,
  loginAttempts,
  rememberTokens,
  sessions,
  users,
} from './schema'

/** Narrow the DB user row to the identity subset the port promises. */
function toAccountRecord(row: {
  id: number
  username: string
  usernameLower: string
  email: string
  emailLower: string
  passwordHash: string | null
  passwordAlgo: string | null
  state: string
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
    // eslint-disable-next-line no-restricted-properties -- F20: reading a column to transport into the record, not a decision
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
  // eslint-disable-next-line no-restricted-properties -- F20: selecting a column to transport, not a decision
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
        // eslint-disable-next-line no-restricted-properties -- F20: writing the persisted column, not a decision
        primaryGroupId: input.primaryGroupId,
      })
      .returning(ACCOUNT_COLUMNS)
    return toAccountRecord(rows[0]!)
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

  async touchLastActive(userId: number, now: Date, windowSeconds: number): Promise<boolean> {
    // The throttle IS the WHERE clause, exactly as `touchLocation` does it: a
    // burst of page views collapses to one write, and no caller can forget.
    // `IS NULL` is included so a member who has never been seen gets their
    // first write — the column has had no writer since `0000`, so on an
    // existing board that is everybody.
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
    // Only touch live sessions; re-revoking a revoked row would move its
    // timestamp and muddy the audit trail.
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  }

  async supersede(oldSessionId: number, newSessionId: number, now: Date): Promise<void> {
    // Point the old row at its replacement and revoke it in one write, so a
    // concurrent request never observes a superseded-but-still-live session.
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
    // The throttle IS the WHERE clause: only rows whose last_seen_at is older
    // than the window are rewritten, so a burst of page views collapses to one
    // write. `RETURNING id` lets the caller know whether the write happened.
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
    // Single-use is enforced *inside* the write: the row is claimed only if it
    // is still unconsumed and unexpired. Two racing redemptions cannot both
    // match, because the first commit flips consumed_at and the second's
    // predicate no longer holds.
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
    // Consuming (rather than deleting) keeps the audit trail and reuses the
    // single-use guard: a revoked token is just one that is already consumed.
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
          // `since` is the exclusive lower bound of the lockout window
          // (now - lockoutMinutes); attempts strictly newer than it count.
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
    // Step 1: atomically claim the presented token — mark it used ONLY if it is
    // unused, unrevoked and unexpired. This conditional UPDATE is the single-use
    // guard: under a race exactly one caller claims it.
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
      // Won the claim: extend the chain with a fresh token in the same family.
      const { familyId, userId } = claimed[0]
      await this.db.insert(rememberTokens).values({
        tokenHash: input.nextHash,
        familyId,
        userId,
        expiresAt: input.nextExpiresAt,
      })
      return { status: 'rotated', userId, familyId }
    }

    // Step 2: the claim failed. Distinguish "replay of a known token" (exists but
    // already used/revoked → reuse, burn the family) from "unknown/expired"
    // (→ invalid). A plain existence lookup is enough because step 1 already
    // ruled out the still-valid case.
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

/** Assemble the adapters into the `AccountStore` the service consumes. */
export function createPostgresAccountStore(db: Database): AccountStore {
  return {
    accounts: new PostgresAccountRepository(db),
    sessions: new PostgresSessionRepository(db),
    tokens: new PostgresCredentialTokenRepository(db),
    loginAttempts: new PostgresLoginAttemptRepository(db),
    remember: new PostgresRememberTokenRepository(db),
  }
}
