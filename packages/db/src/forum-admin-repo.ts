import { sql } from 'drizzle-orm'

import type { ForumOverride } from '@meith/authorization'
import { FORUM_PERMISSION_FIELDS, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { columnName } from './schema/permission-columns'

export interface ForumOptionsInput {
  readonly title: string
  readonly slug: string
  readonly description: string | null
  readonly linkUrl: string | null
  readonly displayOrder: number
  readonly isOpen: boolean
  readonly allowThreads: boolean
  readonly allowReplies: boolean
  readonly allowPolls: boolean
  readonly allowAttachments: boolean
  readonly requiresPrefix: boolean
  readonly moderateNewThreads: boolean
  readonly moderateNewPosts: boolean
}

export const MODERATOR_RIGHTS = [
  'canEditPosts',
  'canSoftDeletePosts',
  'canRestorePosts',
  'canApproveContent',
  'canOpenCloseThreads',
  'canStickThreads',
  'canMoveThreads',
  'canMergeThreads',
  'canSplitThreads',
] as const

export type ModeratorRight = (typeof MODERATOR_RIGHTS)[number]

export interface ModeratorAppointmentRow {
  readonly id: number
  readonly forumId: number
  readonly userId: number | null
  readonly groupId: number | null
  readonly subject: string
  readonly cascadeToSubforums: boolean
  readonly rights: Readonly<Record<ModeratorRight, boolean>>
}

export interface AppointModeratorInput {
  readonly forumId: number
  readonly userId: number | null
  readonly groupId: number | null
  readonly cascadeToSubforums: boolean
  readonly rights: Readonly<Record<ModeratorRight, boolean>>
}

export class PostgresForumAdminRepository {
  constructor(private readonly db: Database) {}

  async listGroups(): Promise<readonly { id: number; title: string }[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, title from usergroups order by display_order, id
      `),
    ) as Array<{ id: number; title: string }>

    return rows.map((row) => ({ id: Number(row.id), title: row.title }))
  }

  async readOptions(forumId: number): Promise<ForumOptionsInput | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select title, slug, description, link_url, display_order, is_open,
               allow_threads, allow_replies, allow_polls, allow_attachments,
               requires_prefix, moderate_new_threads, moderate_new_posts
          from forums where id = ${forumId}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) return null

    return {
      title: String(row.title),
      slug: String(row.slug),
      description: row.description === null ? null : String(row.description),
      linkUrl: row.link_url === null ? null : String(row.link_url),
      displayOrder: Number(row.display_order),
      isOpen: row.is_open === true,
      allowThreads: row.allow_threads === true,
      allowReplies: row.allow_replies === true,
      allowPolls: row.allow_polls === true,
      allowAttachments: row.allow_attachments === true,
      requiresPrefix: row.requires_prefix === true,
      moderateNewThreads: row.moderate_new_threads === true,
      moderateNewPosts: row.moderate_new_posts === true,
    }
  }

  async listModerators(forumId: number): Promise<readonly ModeratorAppointmentRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select m.*, u.username, g.title as group_title
          from forum_moderators m
          left join users u on u.id = m.user_id
          left join usergroups g on g.id = m.group_id
         where m.forum_id = ${forumId}
         order by m.group_id nulls last, u.username_lower
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => {
      const rights: Record<string, boolean> = {}
      for (const right of MODERATOR_RIGHTS) rights[right] = row[columnName(right)] === true

      return {
        id: Number(row.id),
        forumId: Number(row.forum_id),
        userId: row.user_id === null ? null : Number(row.user_id),
        groupId: row.group_id === null ? null : Number(row.group_id),
        subject:
          row.group_title !== null && row.group_title !== undefined
            ? `${String(row.group_title)} (group)`
            : row.username !== null && row.username !== undefined
              ? String(row.username)
              : 'unknown',
        cascadeToSubforums: row.cascade_to_subforums === true,
        rights: rights as Record<ModeratorRight, boolean>,
      }
    })
  }

  async appoint(input: AppointModeratorInput): Promise<void> {
    const hasUser = input.userId !== null
    const hasGroup = input.groupId !== null
    if (hasUser === hasGroup) {
      throw new ValidationError(msg('error.db.appointment-names-member-group-both'))
    }

    const columns = MODERATOR_RIGHTS.map((right) => sql.raw(columnName(right)))
    const literals = MODERATOR_RIGHTS.map((right) => sql`${input.rights[right] === true}`)
    const assignments = MODERATOR_RIGHTS.map(
      (right) => sql`${sql.raw(columnName(right))} = excluded.${sql.raw(columnName(right))}`,
    )
    const conflict = hasUser
      ? sql`(forum_id, user_id) where user_id is not null`
      : sql`(forum_id, group_id) where group_id is not null`

    await this.db.execute(sql`
      insert into forum_moderators
             (forum_id, user_id, group_id, cascade_to_subforums,
              ${sql.join(columns, sql`, `)})
      values (${input.forumId}, ${input.userId}, ${input.groupId},
              ${input.cascadeToSubforums}, ${sql.join(literals, sql`, `)})
      on conflict ${conflict} do update
         set cascade_to_subforums = excluded.cascade_to_subforums,
             ${sql.join(assignments, sql`, `)}
    `)
  }

  async removeModerator(forumId: number, appointmentId: number): Promise<void> {
    await this.db.execute(sql`
      delete from forum_moderators
       where id = ${appointmentId} and forum_id = ${forumId}
    `)
  }

  async findMemberByUsername(username: string): Promise<{ id: number; username: string } | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, username from users where username_lower = ${username.trim().toLowerCase()}
      `),
    ) as Array<{ id: number; username: string }>

    const row = rows[0]
    return row === undefined ? null : { id: Number(row.id), username: row.username }
  }

  async updateOptions(forumId: number, input: ForumOptionsInput): Promise<void> {
    await this.db.execute(sql`
      update forums
         set title = ${input.title},
             slug = ${input.slug},
             description = ${input.description},
             link_url = ${input.linkUrl},
             display_order = ${input.displayOrder},
             is_open = ${input.isOpen},
             allow_threads = ${input.allowThreads},
             allow_replies = ${input.allowReplies},
             allow_polls = ${input.allowPolls},
             allow_attachments = ${input.allowAttachments},
             requires_prefix = ${input.requiresPrefix},
             moderate_new_threads = ${input.moderateNewThreads},
             moderate_new_posts = ${input.moderateNewPosts}
       where id = ${forumId}
    `)
  }

  async readOverrides(forumIds: readonly number[]): Promise<readonly ForumOverride[]> {
    if (forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select * from forum_permissions
         where forum_id in ${sql`(${sql.join(
           forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => {
      const overrides: Record<string, boolean | number> = {}
      for (const field of FORUM_PERMISSION_FIELDS) {
        const value = row[columnName(field.key)]
        if (value === null || value === undefined) continue
        overrides[field.key] = field.kind === 'numeric' ? Number(value) : value === true
      }

      return {
        forumId: Number(row.forum_id),
        groupId: Number(row.group_id),
        overrides,
      }
    })
  }

  private async writeOverrides(
    executor: Pick<Database, 'execute'>,
    forumId: number,
    groupId: number,
    values: Readonly<Record<string, boolean | number | null>>,
  ): Promise<void> {
    if (FORUM_PERMISSION_FIELDS.every((field) => values[field.key] == null)) {
      await executor.execute(sql`
        delete from forum_permissions
         where forum_id = ${forumId} and group_id = ${groupId}
      `)
      return
    }

    const columns = FORUM_PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key)))
    const literals = FORUM_PERMISSION_FIELDS.map((field) => sql`${values[field.key] ?? null}`)
    const assignments = FORUM_PERMISSION_FIELDS.map(
      (field) =>
        sql`${sql.raw(columnName(field.key))} = excluded.${sql.raw(columnName(field.key))}`,
    )

    await executor.execute(sql`
      insert into forum_permissions (forum_id, group_id, ${sql.join(columns, sql`, `)})
      values (${forumId}, ${groupId}, ${sql.join(literals, sql`, `)})
      on conflict (forum_id, group_id) do update set ${sql.join(assignments, sql`, `)}
    `)
  }

  async saveOverrides(
    forumId: number,
    groupId: number,
    values: Readonly<Record<string, boolean | number | null>>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.writeOverrides(tx, forumId, groupId, values)
    })
  }

  async saveOverridesForGroups(
    forumId: number,
    changes: readonly {
      readonly groupId: number
      readonly values: Readonly<Record<string, boolean | number | null>>
    }[],
  ): Promise<void> {
    if (changes.length === 0) return

    await this.db.transaction(async (tx) => {
      for (const change of changes) {
        await this.writeOverrides(tx, forumId, change.groupId, change.values)
      }
    })
  }

  async descendantIds(forumId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select d.id
          from forums f
          join forums d on d.path like f.path || '.%'
         where f.id = ${forumId}
         order by d.path
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }

  async copyToDescendants(
    forumId: number,
    descendantIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<void> {
    if (descendantIds.length === 0 || groupIds.length === 0) return

    const targets = sql.join(
      descendantIds.map((id) => sql`${id}`),
      sql`, `,
    )
    const groups = sql.join(
      groupIds.map((id) => sql`${id}`),
      sql`, `,
    )

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        delete from forum_permissions
         where forum_id in (${targets}) and group_id in (${groups})
      `)

      const columns = FORUM_PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key)))
      await tx.execute(sql`
        insert into forum_permissions (forum_id, group_id, ${sql.join(columns, sql`, `)})
        select target.id, source.group_id, ${sql.join(
          FORUM_PERMISSION_FIELDS.map((field) => sql`source.${sql.raw(columnName(field.key))}`),
          sql`, `,
        )}
          from forum_permissions source
          -- Cast: a bare parameter list is text to the planner, and the
          -- insert then refuses it against an integer column.
          cross join (select unnest(array[${targets}]::int[]) as id) target
         where source.forum_id = ${forumId} and source.group_id in (${groups})
      `)
    })
  }
}
