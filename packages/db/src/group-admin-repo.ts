/**
 * F66 — group administration.
 *
 * Two things about this file are the feature; the rest is CRUD.
 *
 * **Every write bumps `permission_version`, in the same transaction.** F20
 * resolves an Actor once and caches it against that number, so a group
 * permission change whose bump is lost leaves everybody holding their old
 * permissions for the cache's lifetime — a grant that appears not to have
 * worked, and a *revocation that silently did not take effect*. That is the
 * dangerous direction, and it is why the bump is not a separate call the caller
 * could forget: `setPrimaryGroup` established the pattern in `admin-repo.ts`
 * and this follows it exactly.
 *
 * **Mass membership changes are chunked and keyset-paged.** A board with twenty
 * thousand members in a group is a single UPDATE holding row locks for as long
 * as it takes, on the table every request reads. Bounded batches with a cursor
 * on an immutable key mean a long run is interruptible, resumable, and never
 * blocks the board — and F24's promotion loop already pages this way for the
 * same reason.
 */
import { sql } from 'drizzle-orm'

import { PERMISSION_FIELDS, ValidationError } from '@meith/core'
import type { PermissionSet } from '@meith/core'

import type { Database } from './client'
import { columnName } from './schema/permission-columns'
import { groupRowToPermissionSet } from './permissions-map'
import { withPermissionVersionBump, type Tx } from './permission-version'
import { resultRows } from './result-rows'

/** A group as the grid lists it. */
export interface GroupSummaryRow {
  readonly id: number
  readonly key: string
  readonly title: string
  readonly description: string | null
  readonly displayOrder: number
  readonly isSystem: boolean
  readonly isStaffGroup: boolean
  readonly badgeToken: string | null
  /** How many members hold it as their primary group. */
  readonly memberCount: number
}

export interface GroupIdentityInput {
  readonly title: string
  readonly description: string | null
  readonly displayOrder: number
  readonly isStaffGroup: boolean
  readonly badgeToken: string | null
}

/** How far a chunked membership run got, and whether there is more. */
export interface MembershipChunkResult {
  readonly moved: number
  /** Pass back as `afterUserId` to continue. `null` when the run is finished. */
  readonly nextCursor: number | null
}

export class PostgresGroupAdminRepository {
  constructor(private readonly db: Database) {}

  /**
   * Every group, with how many members are in it.
   *
   * The count is a correlated aggregate rather than a denormalised column: the
   * grid is one screen an administrator opens occasionally, and a stored count
   * would be a fourth counter to keep correct for the sake of a page nobody
   * loads in a loop.
   */
  async list(): Promise<readonly GroupSummaryRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select g.id, g.key, g.title, g.description, g.display_order,
               g.is_system, g.is_staff_group, g.badge_token,
               (select count(*) from users u where u.primary_group_id = g.id)::int
                 as member_count
          from usergroups g
         order by g.display_order, g.id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      key: String(row.key),
      title: String(row.title),
      description: row.description === null ? null : String(row.description),
      displayOrder: Number(row.display_order),
      isSystem: row.is_system === true,
      isStaffGroup: row.is_staff_group === true,
      badgeToken: row.badge_token === null ? null : String(row.badge_token),
      memberCount: Number(row.member_count),
    }))
  }

  /** One group's global permissions, complete and coerced (`permissions-map`). */
  async readPermissions(groupId: number): Promise<PermissionSet | null> {
    const rows = resultRows(
      await this.db.execute(sql`select * from usergroups where id = ${groupId}`),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : groupRowToPermissionSet(camelise(row))
  }

  async updateIdentity(groupId: number, input: GroupIdentityInput): Promise<void> {
    await this.withVersionBump(async (tx) => {
      await tx.execute(sql`
        update usergroups
           set title = ${input.title},
               description = ${input.description},
               display_order = ${input.displayOrder},
               is_staff_group = ${input.isStaffGroup},
               badge_token = ${input.badgeToken},
               updated_at = now()
         where id = ${groupId}
      `)
    })
  }

  /**
   * Write a whole permission set.
   *
   * Every field, not a partial: `usergroups` columns are NOT NULL with defaults
   * and there is **no inherit state here** — a group's global permission is the
   * bottom of the resolution (R4.1 layer 1), so every cell has an answer and a
   * partial write would leave the unmentioned ones at whatever a previous save
   * happened to put there.
   */
  async savePermissions(
    groupId: number,
    permissions: Readonly<Record<string, boolean | number>>,
  ): Promise<void> {
    const assignments = PERMISSION_FIELDS.map(
      (field) => sql`${sql.raw(columnName(field.key))} = ${permissions[field.key] ?? field.fallback}`,
    )

    await this.withVersionBump(async (tx) => {
      await tx.execute(sql`
        update usergroups
           set ${sql.join(assignments, sql`, `)}, updated_at = now()
         where id = ${groupId}
      `)
    })
  }

  /**
   * Create a group, copying another's permissions.
   *
   * Copying rather than starting from the registry defaults, because the
   * defaults are deny-everything and a new group made from them is a group
   * whose members cannot see the board. "Like Registered, but…" is what an
   * operator means by a new group essentially every time.
   */
  async create(input: {
    readonly key: string
    readonly title: string
    readonly copyFromGroupId: number
  }): Promise<number> {
    const columns = PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key)))

    return this.withVersionBump(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          insert into usergroups (key, title, is_system, ${sql.join(columns, sql`, `)})
          select ${input.key}, ${input.title}, false,
                 ${sql.join(
                   PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key))),
                   sql`, `,
                 )}
            from usergroups where id = ${input.copyFromGroupId}
          returning id
        `),
      ) as Array<{ id: number }>

      const id = rows[0]?.id
      if (id === undefined) {
        throw new ValidationError('There is no group to copy from.')
      }
      return Number(id)
    })
  }

  /**
   * Delete a group, moving its members somewhere.
   *
   * The move is required rather than optional: `users.primary_group_id` is NOT
   * NULL, so a delete without one either fails on the constraint or — with a
   * cascade — takes the members with it. Asking where they go is the only
   * version of this operation that is not a trap.
   *
   * A system group is refused. `is_system` marks the four the board's own code
   * resolves by key (guests, registered, administrators, banned), and deleting
   * one breaks registration rather than a screen.
   */
  async remove(groupId: number, moveMembersTo: number): Promise<void> {
    if (groupId === moveMembersTo) {
      throw new ValidationError('Members cannot be moved into the group being deleted.')
    }

    await this.withVersionBump(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`select is_system from usergroups where id = ${groupId}`),
      ) as Array<{ is_system: boolean }>

      if (rows[0] === undefined) throw new ValidationError('No such group.')
      if (rows[0].is_system === true) {
        throw new ValidationError(
          'That group is part of how the board works and cannot be deleted.',
        )
      }

      await tx.execute(sql`
        update users
           set primary_group_id = ${moveMembersTo},
               display_group_id = ${moveMembersTo}
         where primary_group_id = ${groupId}
      `)
      await tx.execute(sql`delete from usergroups where id = ${groupId}`)
    })
  }

  /**
   * Move one chunk of a group's members into another group.
   *
   * Keyset-paged and bounded. The alternative — one UPDATE over every member —
   * holds row locks on `users` for the duration, on the table every request
   * reads, and cannot be interrupted or resumed. F24's promotion loop pages the
   * same way for the same reason.
   *
   * Returns the cursor to continue from, so the caller decides how much work to
   * do in one request. Each chunk bumps the version, which is deliberate: a run
   * that stops half way has still changed real permissions, and the actors
   * holding the old ones have to go.
   */
  async moveMembersChunk(input: {
    readonly fromGroupId: number
    readonly toGroupId: number
    readonly afterUserId: number
    readonly limit: number
  }): Promise<MembershipChunkResult> {
    if (input.fromGroupId === input.toGroupId) {
      throw new ValidationError('Choose two different groups.')
    }

    return this.withVersionBump(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          update users
             set primary_group_id = ${input.toGroupId},
                 display_group_id = ${input.toGroupId}
           where id in (
             select id from users
              where primary_group_id = ${input.fromGroupId} and id > ${input.afterUserId}
              order by id
              limit ${input.limit}
           )
          returning id
        `),
      ) as Array<{ id: number }>

      const ids = rows.map((row) => Number(row.id)).sort((a, b) => a - b)
      return {
        moved: ids.length,
        /*
         * A short chunk means the source group is exhausted. Reporting `null`
         * rather than the last id is what lets the caller stop without a second
         * query that finds nothing.
         */
        nextCursor: ids.length < input.limit ? null : (ids.at(-1) ?? null),
      }
    })
  }

  /**
   * Run something, then bump `permission_version` — in one transaction.
   *
   * Not a separate call the caller could forget. A lost bump leaves resolved
   * actors holding permissions that have been revoked, which is the failure
   * direction that matters. The pairing itself lives in `permission-version.ts`,
   * because there are now three writers of it.
   */
  private async withVersionBump<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return withPermissionVersionBump(this.db, work)
  }
}

/** `can_view` → `canView`, which is the shape `permissions-map` expects. */
function camelise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value
  }
  return out
}
