import { and, eq, sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type { PluginGrantRow, PluginGrants } from '@meith/plugin-kit'

import type { Database } from './client'
import { bumpPermissionVersion } from './permission-version'
import { groupRowToPermissionSet } from './permissions-map'
import { resultRows } from './result-rows'
import { userGroupMemberships, usergroups, users } from './schema'
import { permissionsCarryPower } from './staff-groups'

export {
  PLUGIN_UNGRANTABLE_PERMISSIONS,
  permissionsCarryPower,
  type UngrantablePermission,
} from './staff-groups'

const MAX_GRANT_MS = 2 * 366 * 24 * 60 * 60 * 1000

export const DISPLACED_PRIMARY_REASON =
  'the group this member is primary in whenever no plugin grant stands in front of it'

interface GrantableGroup {
  readonly id: number
  readonly key: string
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function isStaffGroup(tx: Tx, groupId: number): Promise<boolean> {
  const rows = resultRows(
    await tx.execute(sql`select * from usergroups where id = ${groupId}`),
  ) as Array<Record<string, unknown>>

  const row = rows[0]
  if (row === undefined) return false

  return (
    row.is_staff_group === true || permissionsCarryPower(groupRowToPermissionSet(camelise(row)))
  )
}

async function promotePrimary(tx: Tx, userId: number, groupId: number): Promise<void> {
  const userRows = resultRows(
    await tx.execute(sql`select primary_group_id from users where id = ${userId} for update`),
  ) as Array<{ primary_group_id: number }>

  const current = userRows[0]
  if (current === undefined) return

  const held = Number(current.primary_group_id)
  if (held === groupId) return
  if (await isStaffGroup(tx, held)) return

  const displacedRows = resultRows(
    await tx.execute(sql`
      select previous_primary_group_id
        from user_group_memberships
       where user_id = ${userId} and group_id = ${held}
    `),
  ) as Array<{ previous_primary_group_id: number | null }>

  const rooted = displacedRows[0]?.previous_primary_group_id
  const displaced = rooted === null || rooted === undefined ? held : Number(rooted)

  await tx.execute(sql`
    insert into user_group_memberships (user_id, group_id, grant_reason)
    values (${userId}, ${displaced}, ${DISPLACED_PRIMARY_REASON})
    on conflict (user_id, group_id) do nothing
  `)

  await tx.execute(sql`
    update user_group_memberships
       set previous_primary_group_id = ${displaced}
     where user_id = ${userId} and group_id = ${groupId}
  `)

  await tx.execute(sql`
    update users set primary_group_id = ${groupId}, updated_at = now() where id = ${userId}
  `)
}

async function restorePrimary(
  tx: Tx,
  userId: number,
  groupId: number,
  displaced: number,
): Promise<void> {
  const changed = resultRows(
    await tx.execute(sql`
      update users
         set primary_group_id = ${displaced},
             display_group_id = case when display_group_id = ${groupId} then null else display_group_id end,
             updated_at = now()
       where id = ${userId} and primary_group_id = ${groupId}
      returning id
    `),
  )

  if (changed.length === 0) return

  await tx.execute(sql`
    delete from user_group_memberships
     where user_id = ${userId}
       and group_id = ${displaced}
       and granted_by_plugin is null
       and expires_at is null
       and grant_reason = ${DISPLACED_PRIMARY_REASON}
  `)
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

async function readableGroup(
  db: Database,
  pluginKey: string,
  groupKey: string,
): Promise<GrantableGroup | null> {
  const rows = resultRows(
    await db.execute(sql`select * from usergroups where key = ${groupKey} limit 1`),
  ) as Array<Record<string, unknown>>

  const row = rows[0]
  if (row === undefined || row.plugin_grantable !== true) return null

  const where = `plugin "${pluginKey}"`
  if (row.is_system === true) {
    throw new ValidationError(
      `${where}: "${groupKey}" is a system group. The board resolves it by key; its membership is not a plugin's to read.`,
    )
  }
  if (row.is_staff_group === true) {
    throw new ValidationError(
      `${where}: "${groupKey}" is a staff group, and staff standing is not a plugin's to read.`,
    )
  }
  if (permissionsCarryPower(groupRowToPermissionSet(camelise(row)))) {
    throw new ValidationError(
      `${where}: "${groupKey}" carries administrative or moderation power, so no plugin may read its membership.`,
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
    async grant({ userId, groupKey, until, reason, primary }) {
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
          if (primary === true) await promotePrimary(tx, userId, group.id)
          await bumpPermissionVersion(tx)
          return
        }

        if (current.grantedByPlugin !== pluginKey) {
          throw new ValidationError(
            `plugin "${pluginKey}": user ${userId} is already a member of "${groupKey}" by someone else's hand. That membership is not this plugin's to change.`,
          )
        }

        let touched = false
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
          touched = true
        }

        if (primary === true) {
          await promotePrimary(tx, userId, group.id)
          touched = true
        }

        if (touched) await bumpPermissionVersion(tx)
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
          returning previous_primary_group_id
        `)
        const gone = resultRows(result) as Array<{ previous_primary_group_id: number | null }>
        if (gone.length === 0) return

        const displaced = gone[0]?.previous_primary_group_id
        if (displaced !== null && displaced !== undefined) {
          await restorePrimary(tx, userId, group.id, Number(displaced))
        }
        await bumpPermissionVersion(tx)
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

    async holds(userId, groupKey) {
      const group = await readableGroup(db, pluginKey, groupKey)
      if (group === null) return false

      const now = clock()

      const userRows = resultRows(
        await db.execute(
          sql`select primary_group_id from users where id = ${userId} and deleted_at is null limit 1`,
        ),
      ) as Array<{ primary_group_id: number }>
      const user = userRows[0]
      if (user === undefined) return false

      const membershipRows = resultRows(
        await db.execute(sql`
          select group_id, expires_at, previous_primary_group_id
            from user_group_memberships
           where user_id = ${userId}
        `),
      ) as Array<{
        group_id: number
        expires_at: Date | string | null
        previous_primary_group_id: number | null
      }>

      const rows = membershipRows.map((row) => ({
        groupId: Number(row.group_id),
        expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
        previousPrimary:
          row.previous_primary_group_id === null ? null : Number(row.previous_primary_group_id),
      }))

      const held = Number(user.primary_group_id)
      const lapsed = rows.find(
        (row) =>
          row.groupId === held &&
          row.previousPrimary !== null &&
          row.expiresAt !== null &&
          row.expiresAt.getTime() <= now.getTime(),
      )
      const effectivePrimary = lapsed?.previousPrimary ?? held
      if (effectivePrimary === group.id) return true

      return rows.some(
        (row) =>
          row.groupId === group.id &&
          (row.expiresAt === null || row.expiresAt.getTime() > now.getTime()),
      )
    },
  }
}

export async function expireTimedGroupMemberships(db: Database, limit: number): Promise<number> {
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
      returning user_id, group_id, previous_primary_group_id
    `)

    const gone = resultRows(result) as Array<{
      user_id: number
      group_id: number
      previous_primary_group_id: number | null
    }>

    for (const row of gone) {
      if (row.previous_primary_group_id === null) continue
      await restorePrimary(
        tx,
        Number(row.user_id),
        Number(row.group_id),
        Number(row.previous_primary_group_id),
      )
    }

    if (gone.length > 0) await bumpPermissionVersion(tx)
    return gone.length
  })
}
