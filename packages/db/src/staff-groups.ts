import { type SQL, sql } from 'drizzle-orm'

import { columnName } from './schema/permission-columns'

export const PLUGIN_UNGRANTABLE_PERMISSIONS = [
  'isAdministrator',
  'canAccessAdminCp',
  'isSuperModerator',
  'canAccessModCp',
  'canWarnUsers',
  'canApproveContent',
  'canEditOthersPosts',
  'canSoftDeletePosts',
] as const

export type UngrantablePermission = (typeof PLUGIN_UNGRANTABLE_PERMISSIONS)[number]

export function permissionsCarryPower(
  permissions: Readonly<Partial<Record<UngrantablePermission, boolean | number>>>,
): boolean {
  return PLUGIN_UNGRANTABLE_PERMISSIONS.some((key) => permissions[key] === true)
}

export function isStaffGroupSql(groupAlias: string): SQL {
  const columns = PLUGIN_UNGRANTABLE_PERMISSIONS.map((key) =>
    sql.raw(`${groupAlias}.${columnName(key)}`),
  )

  return sql.join(
    [
      sql`${sql.raw(`${groupAlias}.is_staff_group`)} = true`,
      ...columns.map((c) => sql`${c} = true`),
    ],
    sql` or `,
  )
}

export function keptDisplayGroupSql(input: {
  readonly column: SQL
  readonly leavingGroupId: SQL
  readonly arrivingGroupId: SQL
}): SQL {
  return sql`nullif(nullif(${input.column}, ${input.leavingGroupId}), ${input.arrivingGroupId})`
}

export function displayGroupIdSql(userAlias: string, primaryAlias: string): SQL {
  return sql`case when (${isStaffGroupSql(primaryAlias)}) then ${sql.raw(`${userAlias}.primary_group_id`)}
                  else coalesce(${sql.raw(`${userAlias}.display_group_id`)}, ${sql.raw(`${userAlias}.primary_group_id`)})
             end`
}
