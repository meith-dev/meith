import { and, asc, eq, gt, or, sql } from 'drizzle-orm'

import type {
  LinkIdentityInput,
  NewPasskey,
  PasskeyRecord,
  PasskeyRepository,
  UserIdentityRecord,
  UserIdentityRepository,
} from '@meith/accounts'

import type { Database } from './client'
import { passkeys, userIdentities } from './schema'

const IDENTITY_COLUMNS = {
  id: userIdentities.id,
  userId: userIdentities.userId,
  provider: userIdentities.provider,
  subject: userIdentities.subject,
  label: userIdentities.label,
  linkedAt: userIdentities.linkedAt,
  lastUsedAt: userIdentities.lastUsedAt,
} as const

export class PostgresUserIdentityRepository implements UserIdentityRepository {
  constructor(private readonly db: Database) {}

  async findBySubject(provider: string, subject: string): Promise<UserIdentityRecord | null> {
    const rows = await this.db
      .select(IDENTITY_COLUMNS)
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
      .limit(1)
    return rows[0] ?? null
  }

  async listForUser(userId: number): Promise<readonly UserIdentityRecord[]> {
    return this.db
      .select(IDENTITY_COLUMNS)
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(asc(userIdentities.id))
  }

  async link(input: LinkIdentityInput): Promise<UserIdentityRecord> {
    const inserted = await this.db
      .insert(userIdentities)
      .values({
        userId: input.userId,
        provider: input.provider,
        subject: input.subject,
        label: input.label,
        linkedAt: input.now,
      })
      .onConflictDoNothing({
        target: [userIdentities.provider, userIdentities.subject],
      })
      .returning(IDENTITY_COLUMNS)

    const record = inserted[0] ?? (await this.findBySubject(input.provider, input.subject))
    if (record === null || record === undefined) {
      throw new Error('the linked identity vanished between insert and read')
    }
    return record
  }

  async unlink(userId: number, identityId: number): Promise<boolean> {
    const removed = await this.db
      .delete(userIdentities)
      .where(and(eq(userIdentities.id, identityId), eq(userIdentities.userId, userId)))
      .returning({ id: userIdentities.id })
    return removed.length > 0
  }

  async markUsed(identityId: number, now: Date): Promise<void> {
    await this.db
      .update(userIdentities)
      .set({ lastUsedAt: now })
      .where(eq(userIdentities.id, identityId))
  }
}

const PASSKEY_COLUMNS = {
  id: passkeys.id,
  userId: passkeys.userId,
  credentialId: passkeys.credentialId,
  publicKey: passkeys.publicKey,
  signCount: passkeys.signCount,
  label: passkeys.label,
  transports: passkeys.transports,
  createdAt: passkeys.createdAt,
  lastUsedAt: passkeys.lastUsedAt,
} as const

export class PostgresPasskeyRepository implements PasskeyRepository {
  constructor(private readonly db: Database) {}

  async findByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
    const rows = await this.db
      .select(PASSKEY_COLUMNS)
      .from(passkeys)
      .where(eq(passkeys.credentialId, credentialId))
      .limit(1)
    return rows[0] ?? null
  }

  async listForUser(userId: number): Promise<readonly PasskeyRecord[]> {
    return this.db
      .select(PASSKEY_COLUMNS)
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.id))
  }

  async create(input: NewPasskey): Promise<PasskeyRecord> {
    const rows = await this.db
      .insert(passkeys)
      .values({
        userId: input.userId,
        credentialId: input.credentialId,
        publicKey: input.publicKey,
        signCount: input.signCount,
        label: input.label,
        transports: input.transports,
        createdAt: input.now,
      })
      .returning(PASSKEY_COLUMNS)
    return rows[0]!
  }

  async remove(userId: number, passkeyId: number): Promise<boolean> {
    const removed = await this.db
      .delete(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
      .returning({ id: passkeys.id })
    return removed.length > 0
  }

  async markUsed(passkeyId: number, signCount: number, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(passkeys)
      .set({ signCount, lastUsedAt: now })
      .where(
        and(
          eq(passkeys.id, passkeyId),
          or(eq(sql`${signCount}`, 0), gt(sql`${signCount}`, passkeys.signCount)),
        ),
      )
      .returning({ id: passkeys.id })
    return rows.length > 0
  }
}
