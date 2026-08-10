import { and, inArray, sql } from 'drizzle-orm'

import type {
  ModeratorAppointment,
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
} from '@meith/authorization'

import type { Database } from './client'
import { forumRowToOverride, groupRowToPermissionSet } from './permissions-map'
import { resultRows } from './result-rows'
import { forumPermissions, forums, usergroups } from './schema'

export function parseAncestorPath(path: string): number[] {
  const ids = path
    .split('.')
    .map((segment) => Number(segment))
    .filter((n) => Number.isInteger(n) && n > 0)
  ids.reverse()
  return ids
}

export class PostgresAuthorizationSource implements AuthorizationSource {
  constructor(private readonly db: Database) {}

  async groupDefaults(
    groupIds: readonly number[],
  ): Promise<readonly GroupDefaults[]> {
    if (groupIds.length === 0) return []

    const rows = await this.db
      .select()
      .from(usergroups)
      .where(inArray(usergroups.id, [...groupIds]))

    return rows.map((row) => ({
      groupId: row.id,
      permissions: groupRowToPermissionSet(row as Record<string, unknown>),
    }))
  }

  async ancestorChain(forumId: number): Promise<readonly number[]> {
    const rows = await this.db
      .select({ path: forums.path })
      .from(forums)
      .where(inArray(forums.id, [forumId]))
      .limit(1)

    const row = rows[0]
    if (!row) return []
    return parseAncestorPath(row.path)
  }

  async forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly ForumOverride[]> {
    if (forumIds.length === 0 || groupIds.length === 0) return []

    const rows = await this.db
      .select()
      .from(forumPermissions)
      .where(
        and(
          inArray(forumPermissions.forumId, [...forumIds]),
          inArray(forumPermissions.groupId, [...groupIds]),
        ),
      )

    return rows.map((row) => ({
      forumId: row.forumId,
      groupId: row.groupId,
      overrides: forumRowToOverride(row as Record<string, unknown>),
    }))
  }

  async allForumIds(): Promise<readonly number[]> {
    const rows = await this.db.select({ id: forums.id }).from(forums)
    return rows.map((r) => r.id)
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    const rows = await this.db
      .select({ id: forums.id, path: forums.path })
      .from(forums)

    return new Map(rows.map((r) => [r.id, parseAncestorPath(r.path)]))
  }
  async moderatorAppointments(
    userId: number | null,
    groupIds: readonly number[],
  ): Promise<readonly ModeratorAppointment[]> {
    if (userId === null && groupIds.length === 0) return []

    const groupList =
      groupIds.length === 0
        ? sql`(null)`
        : sql`(${sql.join(
            groupIds.map((id) => sql`${id}`),
            sql`, `,
          )})`

    const rows = resultRows(
      await this.db.execute(sql`
        select forum_id, cascade_to_subforums, can_approve_content,
               can_edit_posts, can_soft_delete_posts, can_restore_posts,
               can_open_close_threads, can_stick_threads, can_move_threads,
               can_merge_threads, can_split_threads
          from forum_moderators
         where (user_id is not null and user_id = ${userId})
            or (group_id is not null and group_id in ${groupList})
      `),
    ) as Array<{
      forum_id: number
      cascade_to_subforums: boolean
      can_approve_content: boolean
      can_edit_posts: boolean
      can_soft_delete_posts: boolean
      can_restore_posts: boolean
      can_open_close_threads: boolean
      can_stick_threads: boolean
      can_move_threads: boolean
      can_merge_threads: boolean
      can_split_threads: boolean
    }>

    return rows.map((row) => ({
      forumId: Number(row.forum_id),
      cascadeToSubforums: row.cascade_to_subforums,
      canApproveContent: row.can_approve_content,
      canEditPosts: row.can_edit_posts,
      canSoftDeletePosts: row.can_soft_delete_posts,
      canRestorePosts: row.can_restore_posts,
      canOpenCloseThreads: row.can_open_close_threads,
      canStickThreads: row.can_stick_threads,
      canMoveThreads: row.can_move_threads,
      canMergeThreads: row.can_merge_threads,
      canSplitThreads: row.can_split_threads,
    }))
  }

}
