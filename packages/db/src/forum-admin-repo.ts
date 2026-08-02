/**
 * F65 — the writes a forum administration screen needs.
 *
 * Separate from `forum-repo.ts` because that one is the *read* path the whole
 * board depends on, cached and on the index's critical path, and because these
 * are the only statements on this board that write `forum_permissions` at all —
 * the table has existed since F21 with a reader and no writer.
 *
 * Three things are worth reading.
 *
 * **`saveOverrides` writes nulls.** A `forum_permissions` column is nullable
 * and null *means inherit* (R4.1 layer 2), so "clear this cell" is a write of
 * NULL and not a delete of the row — and a row all of whose columns are null is
 * deleted, because that is what it means. Anything else accumulates rows that
 * say nothing and slow the resolver's ancestor walk on every page.
 *
 * **The copy is one statement per (forum, group), inside one transaction.** It
 * is the most destructive operation the panel has, and a half-applied copy
 * would leave a subtree that is neither what it was nor what was asked for.
 *
 * **The subtree is found by `path`, not by recursion.** `forums.path` is the
 * materialised dot-path F16 maintains precisely so "everything under this" is a
 * prefix match — one index scan rather than a recursive CTE per level.
 */
import { sql } from 'drizzle-orm'

import { FORUM_PERMISSION_FIELDS } from '@forum/core'
import type { ForumOverride } from '@forum/authorization'

import type { Database } from './client'
import { columnName } from './schema/permission-columns'
import { resultRows } from './result-rows'

/** The editable options on a forum row. Everything else is derived or counted. */
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

export class PostgresForumAdminRepository {
  constructor(private readonly db: Database) {}

  /**
   * Every group, for the matrix's rows.
   *
   * Here rather than on `AuthorizationSource`: that port is deliberately narrow
   * — "these are the only questions the resolver asks" — and *listing* groups is
   * not one of them. Widening it for one admin screen would put a method on the
   * in-memory fixture that the resolver never calls.
   */
  async listGroups(): Promise<readonly { id: number; title: string }[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, title from usergroups order by display_order, id
      `),
    ) as Array<{ id: number; title: string }>

    return rows.map((row) => ({ id: Number(row.id), title: row.title }))
  }

  /**
   * One forum's editable options.
   *
   * A separate read from `forum-repo.ts`'s, which selects what the *board*
   * needs — a listing does not want eight posting toggles, and adding them
   * there would widen the query every page of the board runs.
   */
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

  /**
   * Every override on a set of forums.
   *
   * One query for the whole subtree, because both the matrix and the copy
   * preview need the *ancestors* as well as the target — the matrix to resolve
   * what a cell inherits, the preview to say what it would replace.
   */
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
        /*
         * Null is dropped rather than carried. `ForumOverride.overrides` is
         * documented as holding only the keys that are actually set, and the
         * resolver's walk depends on it: a present-but-null key would stop the
         * ancestor walk at the wrong forum.
         */
        if (value === null || value === undefined) continue
        overrides[field.key] =
          field.kind === 'numeric' ? Number(value) : value === true
      }

      return {
        forumId: Number(row.forum_id),
        groupId: Number(row.group_id),
        overrides,
      }
    })
  }

  /**
   * Write one (forum, group) row.
   *
   * `values` carries every forum-scoped field, `null` included — the caller has
   * already read the whole row off the form, and a partial write would leave
   * cells at whatever a previous save happened to put there.
   */
  async saveOverrides(
    forumId: number,
    groupId: number,
    values: Readonly<Record<string, boolean | number | null>>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      /*
       * All null is not a row. Keeping one would mean the resolver's ancestor
       * walk visits a row that says nothing, on every permission check, on
       * every page — and an operator clearing a forum's overrides would have no
       * way to tell it had worked.
       */
      if (FORUM_PERMISSION_FIELDS.every((field) => values[field.key] == null)) {
        await tx.execute(sql`
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

      await tx.execute(sql`
        insert into forum_permissions (forum_id, group_id, ${sql.join(columns, sql`, `)})
        values (${forumId}, ${groupId}, ${sql.join(literals, sql`, `)})
        on conflict (forum_id, group_id) do update set ${sql.join(assignments, sql`, `)}
      `)
    })
  }

  /**
   * Every forum strictly beneath this one.
   *
   * A prefix match on `forums.path`, which F16 maintains as a dot-path for
   * exactly this question. The trailing dot matters: without it `10.2` would
   * match `10.20`, and a copy would reach a forum in another subtree.
   */
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

  /**
   * Make every descendant's overrides identical to this forum's.
   *
   * One transaction, because a half-applied copy leaves a subtree that is
   * neither what it was nor what was asked for — and the operator has no way to
   * tell which forums were reached.
   */
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
      /*
       * Cleared first, so a group the source forum does not override ends up
       * with no row on the descendant either. Without this the copy would be
       * "apply the source's rows over the top", which leaves a descendant's
       * extra rows in place — and two forums the operator was told are now the
       * same would not be.
       */
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
