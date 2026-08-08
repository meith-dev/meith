/**
 * F65 — the writes a community administration screen needs.
 *
 * Separate from `community-repo.ts` because that one is the *read* path the whole
 * board depends on, cached and on the index's critical path, and because these
 * are the only statements on this board that write `community_permissions` at all —
 * the table has existed since F21 with a reader and no writer.
 *
 * Three things are worth reading.
 *
 * **`saveOverrides` writes nulls.** A `community_permissions` column is nullable
 * and null *means inherit* (R4.1 layer 2), so "clear this cell" is a write of
 * NULL and not a delete of the row — and a row all of whose columns are null is
 * deleted, because that is what it means. Anything else accumulates rows that
 * say nothing and slow the resolver's ancestor walk on every page.
 *
 * **The copy is one statement per (community, group), inside one transaction.** It
 * is the most destructive operation the panel has, and a half-applied copy
 * would leave a subtree that is neither what it was nor what was asked for.
 *
 * **The subtree is found by `path`, not by recursion.** `communities.path` is the
 * materialised dot-path F16 maintains precisely so "everything under this" is a
 * prefix match — one index scan rather than a recursive CTE per level.
 */
import { sql } from 'drizzle-orm'

import { COMMUNITY_PERMISSION_FIELDS, ValidationError } from '@meith/core'
import type { CommunityOverride } from '@meith/authorization'

import type { Database } from './client'
import { columnName } from './schema/permission-columns'
import { resultRows } from './result-rows'

/** The editable options on a community row. Everything else is derived or counted. */
export interface CommunityOptionsInput {
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


/* ------------------------------------------------------------------ *
 * Moderator appointments
 * ------------------------------------------------------------------ */

/**
 * The rights an appointment carries, as the ACP edits them.
 *
 * A superset of `ModeratorRights`: the Authorizer only asks about the nine it
 * decides actions with, and the table has three more (`canHardDeletePosts`,
 * `canManagePolls`, `canViewIps`) that no action reads yet. They are edited
 * anyway rather than hidden, because a right that exists in the schema and not
 * in the screen is one an operator will assume they have granted.
 */
export const MODERATOR_RIGHTS = [
  'canEditPosts',
  'canSoftDeletePosts',
  'canRestorePosts',
  'canHardDeletePosts',
  'canApproveContent',
  'canOpenCloseThreads',
  'canStickThreads',
  'canMoveThreads',
  'canMergeThreads',
  'canSplitThreads',
  'canManagePolls',
  'canViewIps',
] as const

export type ModeratorRight = (typeof MODERATOR_RIGHTS)[number]

export interface ModeratorAppointmentRow {
  readonly id: number
  readonly communityId: number
  /** Exactly one of these is set. See `appoint` for why the table allows both. */
  readonly userId: number | null
  readonly groupId: number | null
  /** Resolved for display: the member's name or the group's title. */
  readonly subject: string
  readonly cascadeToSubcommunities: boolean
  readonly rights: Readonly<Record<ModeratorRight, boolean>>
}

export interface AppointModeratorInput {
  readonly communityId: number
  readonly userId: number | null
  readonly groupId: number | null
  readonly cascadeToSubcommunities: boolean
  readonly rights: Readonly<Record<ModeratorRight, boolean>>
}

export class PostgresCommunityAdminRepository {
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
   * One community's editable options.
   *
   * A separate read from `community-repo.ts`'s, which selects what the *board*
   * needs — a listing does not want eight posting toggles, and adding them
   * there would widen the query every page of the board runs.
   */
  async readOptions(communityId: number): Promise<CommunityOptionsInput | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select title, slug, description, link_url, display_order, is_open,
               allow_threads, allow_replies, allow_polls, allow_attachments,
               requires_prefix, moderate_new_threads, moderate_new_posts
          from communities where id = ${communityId}
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


  /**
   * The appointments on one community, with the name of whoever holds them.
   *
   * `community_moderators` has had a *reader* since F48 — `authorization-source.ts`
   * resolves appointments into `Target.isCommunityModerator` — and until now no
   * writer at all, so "moderator" could only be configured with SQL.
   */
  async listModerators(communityId: number): Promise<readonly ModeratorAppointmentRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select m.*, u.username, g.title as group_title
          from community_moderators m
          left join users u on u.id = m.user_id
          left join usergroups g on g.id = m.group_id
         where m.community_id = ${communityId}
         order by m.group_id nulls last, u.username_lower
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => {
      const rights: Record<string, boolean> = {}
      for (const right of MODERATOR_RIGHTS) rights[right] = row[columnName(right)] === true

      return {
        id: Number(row.id),
        communityId: Number(row.community_id),
        userId: row.user_id === null ? null : Number(row.user_id),
        groupId: row.group_id === null ? null : Number(row.group_id),
        /*
         * Resolved here rather than left to the caller. A row whose member has
         * been deleted cascades away, so a missing name means a row written by
         * hand against an id that never existed — which should read as what it
         * is rather than as a blank line.
         */
        subject:
          row.group_title !== null && row.group_title !== undefined
            ? `${String(row.group_title)} (group)`
            : row.username !== null && row.username !== undefined
              ? String(row.username)
              : 'unknown',
        cascadeToSubcommunities: row.cascade_to_subcommunities === true,
        rights: rights as Record<ModeratorRight, boolean>,
      }
    })
  }

  /**
   * Appoint, or replace an existing appointment's rights.
   *
   * The partial unique indexes on (community, user) and (community, group) are what
   * make this an upsert rather than a check-then-insert: appointing somebody
   * twice is a rights change, and two administrators doing it at once must not
   * produce two rows that disagree.
   *
   * The table permits a row with neither a user nor a group, and one with both.
   * Neither is meaningful, so the *caller* is required to supply exactly one —
   * and this asserts it rather than trusting the caller, because a row with
   * both would be resolved by F48 as two appointments that cannot be edited
   * apart.
   */
  async appoint(input: AppointModeratorInput): Promise<void> {
    const hasUser = input.userId !== null
    const hasGroup = input.groupId !== null
    if (hasUser === hasGroup) {
      throw new ValidationError('An appointment names a member or a group, not both.')
    }

    const columns = MODERATOR_RIGHTS.map((right) => sql.raw(columnName(right)))
    const literals = MODERATOR_RIGHTS.map((right) => sql`${input.rights[right] === true}`)
    const assignments = MODERATOR_RIGHTS.map(
      (right) => sql`${sql.raw(columnName(right))} = excluded.${sql.raw(columnName(right))}`,
    )
    const conflict = hasUser
      ? sql`(community_id, user_id) where user_id is not null`
      : sql`(community_id, group_id) where group_id is not null`

    await this.db.execute(sql`
      insert into community_moderators
             (community_id, user_id, group_id, cascade_to_subcommunities,
              ${sql.join(columns, sql`, `)})
      values (${input.communityId}, ${input.userId}, ${input.groupId},
              ${input.cascadeToSubcommunities}, ${sql.join(literals, sql`, `)})
      on conflict ${conflict} do update
         set cascade_to_subcommunities = excluded.cascade_to_subcommunities,
             ${sql.join(assignments, sql`, `)}
    `)
  }

  /** Remove one appointment. Scoped to the community, so an id from elsewhere misses. */
  async removeModerator(communityId: number, appointmentId: number): Promise<void> {
    await this.db.execute(sql`
      delete from community_moderators
       where id = ${appointmentId} and community_id = ${communityId}
    `)
  }

  /** A member by name, for the appointment form. Exact, case-insensitive. */
  async findMemberByUsername(username: string): Promise<{ id: number; username: string } | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, username from users where username_lower = ${username.trim().toLowerCase()}
      `),
    ) as Array<{ id: number; username: string }>

    const row = rows[0]
    return row === undefined ? null : { id: Number(row.id), username: row.username }
  }


  async updateOptions(communityId: number, input: CommunityOptionsInput): Promise<void> {
    await this.db.execute(sql`
      update communities
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
       where id = ${communityId}
    `)
  }

  /**
   * Every override on a set of communities.
   *
   * One query for the whole subtree, because both the matrix and the copy
   * preview need the *ancestors* as well as the target — the matrix to resolve
   * what a cell inherits, the preview to say what it would replace.
   */
  async readOverrides(communityIds: readonly number[]): Promise<readonly CommunityOverride[]> {
    if (communityIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select * from community_permissions
         where community_id in ${sql`(${sql.join(
           communityIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => {
      const overrides: Record<string, boolean | number> = {}
      for (const field of COMMUNITY_PERMISSION_FIELDS) {
        const value = row[columnName(field.key)]
        /*
         * Null is dropped rather than carried. `CommunityOverride.overrides` is
         * documented as holding only the keys that are actually set, and the
         * resolver's walk depends on it: a present-but-null key would stop the
         * ancestor walk at the wrong community.
         */
        if (value === null || value === undefined) continue
        overrides[field.key] =
          field.kind === 'numeric' ? Number(value) : value === true
      }

      return {
        communityId: Number(row.community_id),
        groupId: Number(row.group_id),
        overrides,
      }
    })
  }

  /**
   * Write one (community, group) row.
   *
   * `values` carries every community-scoped field, `null` included — the caller has
   * already read the whole row off the form, and a partial write would leave
   * cells at whatever a previous save happened to put there.
   */
  async saveOverrides(
    communityId: number,
    groupId: number,
    values: Readonly<Record<string, boolean | number | null>>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      /*
       * All null is not a row. Keeping one would mean the resolver's ancestor
       * walk visits a row that says nothing, on every permission check, on
       * every page — and an operator clearing a community's overrides would have no
       * way to tell it had worked.
       */
      if (COMMUNITY_PERMISSION_FIELDS.every((field) => values[field.key] == null)) {
        await tx.execute(sql`
          delete from community_permissions
           where community_id = ${communityId} and group_id = ${groupId}
        `)
        return
      }

      const columns = COMMUNITY_PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key)))
      const literals = COMMUNITY_PERMISSION_FIELDS.map((field) => sql`${values[field.key] ?? null}`)
      const assignments = COMMUNITY_PERMISSION_FIELDS.map(
        (field) =>
          sql`${sql.raw(columnName(field.key))} = excluded.${sql.raw(columnName(field.key))}`,
      )

      await tx.execute(sql`
        insert into community_permissions (community_id, group_id, ${sql.join(columns, sql`, `)})
        values (${communityId}, ${groupId}, ${sql.join(literals, sql`, `)})
        on conflict (community_id, group_id) do update set ${sql.join(assignments, sql`, `)}
      `)
    })
  }

  /**
   * Every community strictly beneath this one.
   *
   * A prefix match on `communities.path`, which F16 maintains as a dot-path for
   * exactly this question. The trailing dot matters: without it `10.2` would
   * match `10.20`, and a copy would reach a community in another subtree.
   */
  async descendantIds(communityId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select d.id
          from communities f
          join communities d on d.path like f.path || '.%'
         where f.id = ${communityId}
         order by d.path
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }

  /**
   * Make every descendant's overrides identical to this community's.
   *
   * One transaction, because a half-applied copy leaves a subtree that is
   * neither what it was nor what was asked for — and the operator has no way to
   * tell which communities were reached.
   */
  async copyToDescendants(
    communityId: number,
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
       * Cleared first, so a group the source community does not override ends up
       * with no row on the descendant either. Without this the copy would be
       * "apply the source's rows over the top", which leaves a descendant's
       * extra rows in place — and two communities the operator was told are now the
       * same would not be.
       */
      await tx.execute(sql`
        delete from community_permissions
         where community_id in (${targets}) and group_id in (${groups})
      `)

      const columns = COMMUNITY_PERMISSION_FIELDS.map((field) => sql.raw(columnName(field.key)))
      await tx.execute(sql`
        insert into community_permissions (community_id, group_id, ${sql.join(columns, sql`, `)})
        select target.id, source.group_id, ${sql.join(
          COMMUNITY_PERMISSION_FIELDS.map((field) => sql`source.${sql.raw(columnName(field.key))}`),
          sql`, `,
        )}
          from community_permissions source
          -- Cast: a bare parameter list is text to the planner, and the
          -- insert then refuses it against an integer column.
          cross join (select unnest(array[${targets}]::int[]) as id) target
         where source.community_id = ${communityId} and source.group_id in (${groups})
      `)
    })
  }
}
