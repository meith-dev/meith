import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type { PluginGrantRow, PluginGrants } from '@meith/plugin-kit'

import type { Database } from './client'
import { bumpPermissionVersion } from './permission-version'
import { groupRowToPermissionSet } from './permissions-map'
import { resultRows } from './result-rows'
import { usergroups, userGroupMemberships, users } from './schema'

export const PLUGIN_UNGRANTABLE_PERMISSIONS = [
  'isAdministrator',
  'canAccessAdminCp',
  'isSuperModerator',
  'canAccessModCp',
  'canWarnUsers',
  'canApproveContent',
  'canEditOthersPosts',
  'canDeleteOthersPosts',
  'canSoftDeletePosts',
] as const

export type UngrantablePermission = (typeof PLUGIN_UNGRANTABLE_PERMISSIONS)[number]

export function permissionsCarryPower(
  permissions: Readonly<Partial<Record<UngrantablePermission, boolean | number>>>,
): boolean {
  return PLUGIN_UNGRANTABLE_PERMISSIONS.some((key) => permissions[key] === true)
}

const MAX_GRANT_MS = 2 * 366 * 24 * 60 * 60 * 1000

interface GrantableGroup {
  readonly id: number
  readonly key: string
}

function camelise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return out
}

async function grantableGroup(
  db: Database,
  pluginKey: string,
  groupKey: string,
): Promise<GrantableGroup> {
  const rows = resultRows(
    await db.execute(sql`select * from usergroups where key = ${groupKey} limit 1`),
  ) as Array<Record<string, unknown>>

  const row = rows[0]
  const where = `plugin "${pluginKey}"`

  if (row === undefined) {
    throw new ValidationError(`${where}: no group is keyed "${groupKey}".`)
  }
  if (row.is_system === true) {
    throw new ValidationError(
      `${where}: "${groupKey}" is a system group. The board resolves it by key; membership is not a plugin's to hand out.`,
    )
  }
  if (row.is_staff_group === true) {
    throw new ValidationError(
      `${where}: "${groupKey}" is a staff group, and staff is appointed, not granted by code.`,
    )
  }
  if (permissionsCarryPower(groupRowToPermissionSet(camelise(row)))) {
    throw new ValidationError(
      `${where}: "${groupKey}" carries administrative or moderation power, so no plugin may grant it.`,
    )
  }
  if (row.plugin_grantable !== true) {
    throw new ValidationError(
      `${where}: "${groupKey}" is not marked as grantable by plugins. An administrator opts a group in under Admin → Groups.`,
    )
  }

  return { id: Number(row.id), key: String(row.key) }
}

function checkedUntil(pluginKey: string, until: Date, now: Date): Date {
  if (!(until instanceof Date) || Number.isNaN(until.getTime())) {
    throw new ValidationError(`plugin "${pluginKey}": the grant needs a valid expiry date.`)
  }
  if (until.getTime() <= now.getTime()) {
    throw new ValidationError(
      `plugin "${pluginKey}": a grant expiring in the past is a grant that never was. Got ${until.toISOString()}.`,
    )
  }
  if (until.getTime() - now.getTime() > MAX_GRANT_MS) {
    throw new ValidationError(
      `plugin "${pluginKey}": grants are capped at two years. A longer arrangement is an operator decision, made in the panel.`,
    )
  }
  return until
}

export function pluginGrants(
  db: Database,
  pluginKey: string,
  clock: () => Date = () => new Date(),
): PluginGrants {
  return {
    async grant({ userId, groupKey, until, reason }) {
      const now = clock()
      const expiry = checkedUntil(pluginKey, until, now)
      if (reason.trim() === '') {
        throw new ValidationError(
          `plugin "${pluginKey}": a grant needs a reason — it is the row's audit trail.`,
        )
      }

      const group = await grantableGroup(db, pluginKey, groupKey)

      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      if (userRows.length === 0) {
        throw new ValidationError(`plugin "${pluginKey}": no user ${userId}.`)
      }

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            grantedByPlugin: userGroupMemberships.grantedByPlugin,
            expiresAt: userGroupMemberships.expiresAt,
          })
          .from(userGroupMemberships)
          .where(
            and(
              eq(userGroupMemberships.userId, userId),
              eq(userGroupMemberships.groupId, group.id),
            ),
          )
          .limit(1)

        const current = existing[0]
        if (current === undefined) {
          await tx.insert(userGroupMemberships).values({
            userId,
            groupId: group.id,
            expiresAt: expiry,
            grantedByPlugin: pluginKey,
            grantReason: reason,
          })
          await bumpPermissionVersion(tx)
          return
        }

        if (current.grantedByPlugin !== pluginKey) {
          throw new ValidationError(
            `plugin "${pluginKey}": user ${userId} is already a member of "${groupKey}" by someone else's hand. That membership is not this plugin's to change.`,
          )
        }

        if (current.expiresAt === null || current.expiresAt.getTime() < expiry.getTime()) {
          await tx
            .update(userGroupMemberships)
            .set({ expiresAt: expiry, grantReason: reason })
            .where(
              and(
                eq(userGroupMemberships.userId, userId),
                eq(userGroupMemberships.groupId, group.id),
              ),
            )
          await bumpPermissionVersion(tx)
        }
      })
    },

    async extend({ userId, groupKey, until }) {
      const now = clock()
      const expiry = checkedUntil(pluginKey, until, now)
      const group = await grantableGroup(db, pluginKey, groupKey)

      await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          update user_group_memberships
             set expires_at = ${expiry}
           where user_id = ${userId}
             and group_id = ${group.id}
             and granted_by_plugin = ${pluginKey}
             and expires_at < ${expiry}
          returning user_id
        `)
        void resultRows(result)
      })
    },

    async revoke({ userId, groupKey, reason }) {
      if (reason.trim() === '') {
        throw new ValidationError(
          `plugin "${pluginKey}": a revocation needs a reason, for the same audit trail as the grant.`,
        )
      }

      const groupRows = await db
        .select({ id: usergroups.id })
        .from(usergroups)
        .where(eq(usergroups.key, groupKey))
        .limit(1)
      const group = groupRows[0]
      if (group === undefined) return

      await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          delete from user_group_memberships
           where user_id = ${userId}
             and group_id = ${group.id}
             and granted_by_plugin = ${pluginKey}
          returning user_id
        `)
        if (resultRows(result).length > 0) {
          await bumpPermissionVersion(tx)
        }
      })
    },

    async list(userId) {
      const rows = await db
        .select({
          groupKey: usergroups.key,
          expiresAt: userGroupMemberships.expiresAt,
        })
        .from(userGroupMemberships)
        .innerJoin(usergroups, eq(usergroups.id, userGroupMemberships.groupId))
        .where(
          and(
            eq(userGroupMemberships.userId, userId),
            eq(userGroupMemberships.grantedByPlugin, pluginKey),
          ),
        )

      return rows
        .filter((row): row is { groupKey: string; expiresAt: Date } => row.expiresAt !== null)
        .map((row): PluginGrantRow => ({ groupKey: row.groupKey, expiresAt: row.expiresAt }))
    },
  }
}

export async function expireTimedGroupMemberships(
  db: Database,
  limit: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      delete from user_group_memberships
       where (user_id, group_id) in (
         select user_id, group_id
           from user_group_memberships
          where expires_at is not null
            and expires_at <= now()
          limit ${limit}
       )
      returning user_id
    `)

    const removed = resultRows(result).length
    if (removed > 0) await bumpPermissionVersion(tx)
    return removed
  })
}
