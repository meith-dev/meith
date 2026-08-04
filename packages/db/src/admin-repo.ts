/**
 * Operator-level reads and writes: look a user or group up the way a human
 * refers to it, move a user between groups, retire cached actors.
 *
 * Lives here rather than in the CLI because R2 keeps SQL inside `@meith/db` —
 * a CLI composing its own queries would be a second place that knows the
 * schema, and it would drift. The ACP's user and group screens (F66/F67) want
 * exactly these operations, so this is their seam too.
 */
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

/**
 * Operators refer to things by name; scripts refer to them by id. Accepting
 * both means neither has to look the other up first.
 *
 * A purely numeric reference is matched against the id *or* the name, not the
 * id alone — a board may legitimately have a user called "1234", and silently
 * resolving to a different account would be the worst possible outcome for a
 * command whose job is granting privileges.
 */
function numericOr(reference: string): number | null {
  const value = Number(reference)
  return Number.isInteger(value) && reference.trim() !== '' ? value : null
}

export class PostgresAdminRepository {
  constructor(private readonly db: Database) {}

  /** `usernameLower` must already be folded by the caller (`foldIdentifier`). */
  async findUser(reference: string, usernameLower: string): Promise<UserSummary | null> {
    const id = numericOr(reference)
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        /*
         * F20: this is group *administration*, not an authorization decision.
         * The value is reported to an operator and compared only to detect a
         * no-op promotion; nothing here grants or denies anything. Access
         * questions still go through the Authorizer.
         */
        // eslint-disable-next-line no-restricted-properties -- F20: administering group assignment, not deciding access
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

  /** For the "no such group, did you mean…" message. */
  async listGroupKeys(): Promise<string[]> {
    const rows = await this.db.select({ key: usergroups.key }).from(usergroups)
    return rows.map((r) => r.key)
  }

  /**
   * Move a user's primary group, and retire every resolved Actor.
   *
   * Both in one transaction. A group change whose `permission_version` bump is
   * lost leaves already-resolved actors holding their old permissions for the
   * cache's lifetime: a promotion appears not to have worked, and — worse — a
   * demotion silently does not take effect.
   *
   * `displayGroupId` follows the primary group, which is the behaviour someone
   * running `user:promote` expects; the ACP can separate them later.
   */
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

  /** The group new registrations join, resolved by key rather than by id. */
  async registeredGroupId(): Promise<number | null> {
    return (await this.findGroup('registered'))?.id ?? null
  }
}
