import { sql } from 'drizzle-orm'

import type { PermissionSet } from '@meith/core'
import { PERMISSION_FIELDS, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { type Tx, withPermissionVersionBump } from './permission-version'
import { groupRowToPermissionSet } from './permissions-map'
import { resultRows } from './result-rows'
import { columnName } from './schema/permission-columns'
import { keptDisplayGroupSql } from './staff-groups'

export interface GroupSummaryRow {
  readonly id: number
  readonly key: string
  readonly title: string
  readonly description: string | null
  readonly displayOrder: number
  readonly isSystem: boolean
  readonly isStaffGroup: boolean
  readonly pluginGrantable: boolean
  readonly badgeToken: string | null
  readonly nameColorLight: string | null
  readonly nameColorDark: string | null
  readonly badgeImageLight: string | null
  readonly badgeImageDark: string | null
  readonly memberCount: number
}

export interface GroupIdentityInput {
  readonly title: string
  readonly description: string | null
  readonly displayOrder: number
  readonly isStaffGroup: boolean
  readonly pluginGrantable: boolean
  readonly badgeToken: string | null
  readonly nameColorLight: string | null
  readonly nameColorDark: string | null
}

export interface MembershipChunkResult {
  readonly moved: number
  readonly nextCursor: number | null
}

export class PostgresGroupAdminRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<readonly GroupSummaryRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select g.id, g.key, g.title, g.description, g.display_order,
               g.is_system, g.is_staff_group, g.plugin_grantable, g.badge_token,
               g.name_color_light, g.name_color_dark,
               g.badge_image_light, g.badge_image_dark,
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
      pluginGrantable: row.plugin_grantable === true,
      badgeToken: row.badge_token === null ? null : String(row.badge_token),
      nameColorLight: row.name_color_light === null ? null : String(row.name_color_light),
      nameColorDark: row.name_color_dark === null ? null : String(row.name_color_dark),
      badgeImageLight: row.badge_image_light === null ? null : String(row.badge_image_light),
      badgeImageDark: row.badge_image_dark === null ? null : String(row.badge_image_dark),
      memberCount: Number(row.member_count),
    }))
  }

  async setBadge(
    groupId: number,
    scheme: 'light' | 'dark',
    key: string | null,
  ): Promise<string | null> {
    const column = scheme === 'dark' ? sql`badge_image_dark` : sql`badge_image_light`

    const rows = resultRows(
      await this.db.execute(sql`
        update usergroups u
           set ${column} = ${key}, updated_at = now()
          from usergroups old
         where u.id = ${groupId}
           and old.id = u.id
        returning old.${column} as previous
      `),
    ) as Array<Record<string, unknown>>

    const previous = rows[0]?.previous
    return typeof previous === 'string' ? previous : null
  }

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
               plugin_grantable = ${input.pluginGrantable},
               badge_token = ${input.badgeToken},
               name_color_light = ${input.nameColorLight},
               name_color_dark = ${input.nameColorDark},
               updated_at = now()
         where id = ${groupId}
      `)
    })
  }

  async savePermissions(
    groupId: number,
    permissions: Readonly<Record<string, boolean | number>>,
  ): Promise<void> {
    const assignments = PERMISSION_FIELDS.map(
      (field) =>
        sql`${sql.raw(columnName(field.key))} = ${permissions[field.key] ?? field.fallback}`,
    )

    await this.withVersionBump(async (tx) => {
      await tx.execute(sql`
        update usergroups
           set ${sql.join(assignments, sql`, `)}, updated_at = now()
         where id = ${groupId}
      `)
    })
  }

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
        throw new ValidationError(msg('error.db.there-group-copy-from'))
      }
      return Number(id)
    })
  }

  async remove(groupId: number, moveMembersTo: number): Promise<void> {
    if (groupId === moveMembersTo) {
      throw new ValidationError(msg('error.db.members-moved-into-group-being'))
    }

    await this.withVersionBump(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`select is_system from usergroups where id = ${groupId}`),
      ) as Array<{ is_system: boolean }>

      if (rows[0] === undefined) throw new ValidationError(msg('error.db.such-group'))
      if (rows[0].is_system === true) {
        throw new ValidationError(msg('error.db.group-part-how-board-works'))
      }

      await tx.execute(sql`
        update users
           set primary_group_id = ${moveMembersTo},
               display_group_id = ${keptDisplayGroupSql({
                 column: sql.raw('display_group_id'),
                 leavingGroupId: sql`${groupId}`,
                 arrivingGroupId: sql`${moveMembersTo}`,
               })}
         where primary_group_id = ${groupId}
      `)
      await tx.execute(sql`delete from usergroups where id = ${groupId}`)
    })
  }

  async moveMembersChunk(input: {
    readonly fromGroupId: number
    readonly toGroupId: number
    readonly afterUserId: number
    readonly limit: number
  }): Promise<MembershipChunkResult> {
    if (input.fromGroupId === input.toGroupId) {
      throw new ValidationError(msg('error.db.choose-two-different-groups'))
    }

    return this.withVersionBump(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          update users
             set primary_group_id = ${input.toGroupId},
                 display_group_id = ${keptDisplayGroupSql({
                   column: sql.raw('display_group_id'),
                   leavingGroupId: sql`${input.fromGroupId}`,
                   arrivingGroupId: sql`${input.toGroupId}`,
                 })}
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
        nextCursor: ids.length < input.limit ? null : (ids.at(-1) ?? null),
      }
    })
  }

  private async withVersionBump<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return withPermissionVersionBump(this.db, work)
  }
}

function camelise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value
  }
  return out
}
