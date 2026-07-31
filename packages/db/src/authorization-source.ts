/**
 * Postgres implementation of the `AuthorizationSource` port.
 *
 * The port is defined by `@forum/authorization` (the domain), and this is its
 * SQL adapter (the infrastructure) — the standard hexagonal arrangement where
 * persistence depends on the domain's interface, never the reverse. The
 * authorizer itself stays pure and database-free; this file is the only place
 * that turns its four questions into queries.
 *
 * Every method is bounded and indexed:
 *   - groupDefaults / forumOverrides use `IN (...)` over primary/foreign keys.
 *   - ancestorChain is a single-row read plus a string split, because the tree
 *     is stored as a materialised path (`forums.path = '1.4.9.12'`). F16
 *     requires "my ancestors" to cost one query regardless of depth; parsing my
 *     own path delivers exactly that, with no recursive CTE.
 */
import { and, inArray, sql } from 'drizzle-orm'

import type {
  ModeratorAppointment,
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
} from '@forum/authorization'

import type { Database } from './client'
import { forumRowToOverride, groupRowToPermissionSet } from './permissions-map'
import { resultRows } from './result-rows'
import { forumPermissions, forums, usergroups } from './schema'

/**
 * Parse a materialised path into ancestor IDs, nearest-first and inclusive.
 *
 *   '1.4.9.12'  ->  [12, 9, 4, 1]
 *
 * Nearest-first is the order the resolver's "first non-null wins" walk expects:
 * a forum's own override beats its parent's, which beats the grandparent's.
 */
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
    if (!row) return [] // forum does not exist -> empty, per the port contract
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
        // Both dimensions filtered in SQL. The (forum_id, group_id) index serves
        // the forum_id prefix, and both sets are small (the groups of one user,
        // the ancestors of one forum), so this stays a bounded index scan rather
        // than pulling every row for a forum and discarding groups in JS.
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

  /**
   * Every forum's ancestor chain, in one query.
   *
   * The materialised path makes this free: the chain is a parse of a string
   * already on the row, so reading `(id, path)` for the whole board and
   * splitting in memory costs exactly one statement no matter how deep or wide
   * the tree is. Asking per forum is what made `visibleForumIds` an N+1.
   */
  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    const rows = await this.db
      .select({ id: forums.id, path: forums.path })
      .from(forums)

    return new Map(rows.map((r) => [r.id, parseAncestorPath(r.path)]))
  }
  /**
   * This actor's moderator appointments (F48).
   *
   * `forum_moderators` has existed since F21 with no reader at all, so until
   * now an appointment was a row nothing consulted and "moderator" meant
   * "member of a staff group". One query, by user or by any of the actor's
   * groups; expansion through `cascade_to_subforums` happens in the Authorizer,
   * which already holds the tree.
   */
  async moderatorAppointments(
    userId: number | null,
    groupIds: readonly number[],
  ): Promise<readonly ModeratorAppointment[]> {
    if (userId === null && groupIds.length === 0) return []

    /*
     * An `in (…)` list, not `= any($1::int[])`: drizzle expands a JavaScript
     * array in a template into a placeholder *list*, so `any(${groupIds})`
     * compiles to `any(($1, $2))` and fails to parse. `in (null)` is the right
     * reading of "no groups": never true.
     */
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
               can_edit_posts, can_soft_delete_posts, can_restore_posts
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
    }>

    return rows.map((row) => ({
      forumId: Number(row.forum_id),
      cascadeToSubforums: row.cascade_to_subforums,
      canApproveContent: row.can_approve_content,
      canEditPosts: row.can_edit_posts,
      canSoftDeletePosts: row.can_soft_delete_posts,
      canRestorePosts: row.can_restore_posts,
    }))
  }

}
