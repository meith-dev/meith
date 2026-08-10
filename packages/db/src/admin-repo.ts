import { eq, or, sql } from 'drizzle-orm'

import type { Database } from './client'
import { cacheVersions, usergroups, users } from './schema'

export interface UserSummary {
  readonly id: number
  readonly username: string
  readonly primaryGroupId: number | null
}

export interface GroupSummary {
  readonly id: number
  readonly key: string
  readonly title: string
}

function numericOr(reference: string): number | null {
  const value = Number(reference)
  return Number.isInteger(value) && reference.trim() !== '' ? value : null
}

export class PostgresAdminRepository {
  constructor(private readonly db: Database) {}

  async findUser(reference: string, usernameLower: string): Promise<UserSummary | null> {
    const id = numericOr(reference)
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        // eslint-disable-next-line no-restricted-properties -- administering group assignment, not deciding access
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(
        id === null
          ? eq(users.usernameLower, usernameLower)
          : or(eq(users.id, id), eq(users.usernameLower, usernameLower)),
      )
      .limit(1)

    return rows[0] ?? null
  }

  async findGroup(reference: string): Promise<GroupSummary | null> {
    const id = numericOr(reference)
    const rows = await this.db
      .select({ id: usergroups.id, key: usergroups.key, title: usergroups.title })
      .from(usergroups)
      .where(
        id === null
          ? eq(usergroups.key, reference)
          : or(eq(usergroups.id, id), eq(usergroups.key, reference)),
      )
      .limit(1)

    return rows[0] ?? null
  }

  async listGroupKeys(): Promise<string[]> {
    const rows = await this.db.select({ key: usergroups.key }).from(usergroups)
    return rows.map((r) => r.key)
  }

  async setPrimaryGroup(userId: number, groupId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ primaryGroupId: groupId, displayGroupId: groupId })
        .where(eq(users.id, userId))

      await tx
        .insert(cacheVersions)
        .values({ key: 'permissions', version: 1 })
        .onConflictDoUpdate({
          target: cacheVersions.key,
          set: { version: sql`${cacheVersions.version} + 1`, bumpedAt: new Date() },
        })
    })
  }

  async registeredGroupId(): Promise<number | null> {
    return (await this.findGroup('registered'))?.id ?? null
  }
}
