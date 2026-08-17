import { sql } from 'drizzle-orm'

import { BodyFormat } from '@meith/markdown'

import type { Database } from './client'
import { resolveLegacyIds } from './import-repo'
import { resultRows } from './result-rows'

interface ImportedUserRow {
  readonly legacyId: number
  readonly username: string
  readonly email: string
  readonly legacyPasswordHash: string
  readonly registeredAt: Date
  readonly lastVisitAt: Date | null
  readonly postCount: number
  readonly legacyGroupId: number
}

interface ImportedForumRow {
  readonly legacyId: number
  readonly type: 'category' | 'forum' | 'link'
  readonly title: string
  readonly description: string | null
  readonly legacyParentId: number | null
  readonly displayOrder: number
  readonly linkUrl: string | null
}

type Visibility = 'visible' | 'unapproved' | 'deleted'

interface ImportedThreadRow {
  readonly legacyId: number
  readonly legacyForumId: number
  readonly title: string
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly createdAt: Date
  readonly lastPostAt: Date
  readonly replyCount: number
  readonly viewCount: number
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly visibility: Visibility
}

interface ImportedPostRow {
  readonly legacyId: number
  readonly legacyThreadId: number
  readonly legacyForumId: number
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly body: string
  readonly createdAt: Date
  readonly editedAt: Date | null
  readonly visibility: Visibility
}

interface Skip {
  readonly legacyId: number
  readonly reason: string
}

interface WriteResult {
  readonly inserted: number
  readonly updated: number
  readonly skipped: readonly Skip[]
}

interface Written {
  readonly legacy_id: number
  readonly new_id: number
  readonly inserted: boolean
}

function parentIds(ids: readonly (number | null)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== null && id > 0))]
}

const empty: WriteResult = { inserted: 0, updated: 0, skipped: [] }

function tally(rows: readonly Written[], skipped: readonly Skip[]): WriteResult {
  return {
    inserted: rows.filter((row) => row.inserted).length,
    updated: rows.filter((row) => !row.inserted).length,
    skipped,
  }
}

function slugFor(title: string, id: number, fallback: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug.length === 0 ? `${fallback}-${id}` : slug
}

export class PostgresImportSink {
  constructor(private readonly db: Database) {}

  async putUsers(rows: readonly ImportedUserRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const groupRows = resultRows<{ id: number }>(
      await this.db.execute(sql`select id from usergroups where key = 'registered' limit 1`),
    )

    const groupId = groupRows[0]?.id
    if (groupId === undefined) {
      throw new Error('No "registered" usergroup. Run migrations before importing.')
    }

    const taken = resultRows<{
      username_lower: string
      email_lower: string
      legacy_mybb_uid: number | null
    }>(
      await this.db.execute(sql`
      select username_lower, email_lower, legacy_mybb_uid from users
      where username_lower in (${sql.join(
        rows.map((r) => sql`${r.username.toLowerCase()}`),
        sql`, `,
      )})
         or email_lower in (${sql.join(
           rows.map((r) => sql`${r.email.toLowerCase()}`),
           sql`, `,
         )})
    `),
    )

    const byName = new Map(taken.map((row) => [row.username_lower, row.legacy_mybb_uid]))
    const byEmail = new Map(taken.map((row) => [row.email_lower, row.legacy_mybb_uid]))

    const skipped: Skip[] = []
    const writable = rows.filter((row) => {
      const nameOwner = byName.get(row.username.toLowerCase())
      const emailOwner = byEmail.get(row.email.toLowerCase())

      if (nameOwner !== undefined && nameOwner !== row.legacyId) {
        skipped.push({ legacyId: row.legacyId, reason: `username "${row.username}" already taken` })
        return false
      }
      if (emailOwner !== undefined && emailOwner !== row.legacyId) {
        skipped.push({ legacyId: row.legacyId, reason: 'e-mail address already registered' })
        return false
      }
      return true
    })

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
      insert into users (
        username, username_lower, email, email_lower,
        password_hash, password_algo, primary_group_id, display_group_id,
        post_count, created_at, last_active_at, legacy_mybb_uid
      )
      values ${sql.join(
        writable.map(
          (row) => sql`(
            ${row.username}, ${row.username.toLowerCase()},
            ${row.email}, ${row.email.toLowerCase()},
            ${row.legacyPasswordHash}, 'mybb',
            ${groupId}, ${groupId},
            ${row.postCount}, ${row.registeredAt}, ${row.lastVisitAt},
            ${row.legacyId}
          )`,
        ),
        sql`, `,
      )}
      on conflict (legacy_mybb_uid) where legacy_mybb_uid is not null do update set
        username = excluded.username,
        username_lower = excluded.username_lower,
        email = excluded.email,
        email_lower = excluded.email_lower,
        password_hash = excluded.password_hash,
        password_algo = excluded.password_algo,
        post_count = excluded.post_count
      returning legacy_mybb_uid as legacy_id, id as new_id, (xmax = 0) as inserted
    `),
    )

    await this.#map('user', written)
    return tally(written, skipped)
  }

  async putForums(rows: readonly ImportedForumRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const parents = await resolveLegacyIds(
      this.db,
      'forum',
      parentIds(rows.map((row) => row.legacyParentId)),
    )

    const skipped: Skip[] = []
    const writable: { row: ImportedForumRow; parentId: number | null }[] = []

    for (const row of rows) {
      if (row.legacyParentId === null || row.legacyParentId === 0) {
        writable.push({ row, parentId: null })
        continue
      }
      const parentId = parents.get(row.legacyParentId)
      if (parentId === undefined) {
        skipped.push({
          legacyId: row.legacyId,
          reason: `parent forum ${row.legacyParentId} not imported yet`,
        })
        continue
      }
      writable.push({ row, parentId })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
      insert into forums (
        type, title, description, slug, parent_id, path, depth,
        display_order, link_url, allow_threads, legacy_mybb_fid
      )
      values ${sql.join(
        writable.map(
          ({ row, parentId }) => sql`(
            ${row.type}, ${row.title}, ${row.description},
            ${slugFor(row.title, row.legacyId, 'forum')},
            ${parentId}, '', 0,
            ${row.displayOrder}, ${row.linkUrl}, ${row.type === 'forum'}, ${row.legacyId}
          )`,
        ),
        sql`, `,
      )}
      on conflict (legacy_mybb_fid) where legacy_mybb_fid is not null do update set
        type = excluded.type,
        title = excluded.title,
        description = excluded.description,
        parent_id = excluded.parent_id,
        display_order = excluded.display_order,
        link_url = excluded.link_url
      returning legacy_mybb_fid as legacy_id, id as new_id, (xmax = 0) as inserted
    `),
    )

    await this.#map('forum', written)
    await this.#rebuildPaths()
    return tally(written, skipped)
  }

  async putThreads(rows: readonly ImportedThreadRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const forums = await resolveLegacyIds(
      this.db,
      'forum',
      parentIds(rows.map((r) => r.legacyForumId)),
    )
    const authors = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((r) => r.legacyAuthorId)),
    )

    const skipped: Skip[] = []
    const writable: { row: ImportedThreadRow; forumId: number; authorId: number | null }[] = []

    for (const row of rows) {
      const forumId = forums.get(row.legacyForumId)
      if (forumId === undefined) {
        skipped.push({
          legacyId: row.legacyId,
          reason: `forum ${row.legacyForumId} not imported`,
        })
        continue
      }
      writable.push({ row, forumId, authorId: authors.get(row.legacyAuthorId) ?? null })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
      insert into threads (
        forum_id, title, slug, author_user_id, author_username,
        created_at, last_post_at, reply_count, view_count,
        is_sticky, is_locked, visibility, legacy_mybb_tid
      )
      values ${sql.join(
        writable.map(
          ({ row, forumId, authorId }) => sql`(
            ${forumId}, ${row.title}, ${slugFor(row.title, row.legacyId, 'thread')},
            ${authorId}, ${row.authorUsername},
            ${row.createdAt}, ${row.lastPostAt}, ${row.replyCount}, ${row.viewCount},
            ${row.isSticky}, ${row.isLocked}, ${row.visibility}, ${row.legacyId}
          )`,
        ),
        sql`, `,
      )}
      on conflict (legacy_mybb_tid) where legacy_mybb_tid is not null do update set
        forum_id = excluded.forum_id,
        title = excluded.title,
        author_user_id = excluded.author_user_id,
        author_username = excluded.author_username,
        last_post_at = excluded.last_post_at,
        reply_count = excluded.reply_count,
        view_count = excluded.view_count,
        is_sticky = excluded.is_sticky,
        is_locked = excluded.is_locked,
        visibility = excluded.visibility
      returning legacy_mybb_tid as legacy_id, id as new_id, (xmax = 0) as inserted
    `),
    )

    await this.#map('thread', written)
    return tally(written, skipped)
  }

  async putPosts(rows: readonly ImportedPostRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const threads = await resolveLegacyIds(
      this.db,
      'thread',
      parentIds(rows.map((r) => r.legacyThreadId)),
    )
    const forums = await resolveLegacyIds(
      this.db,
      'forum',
      parentIds(rows.map((r) => r.legacyForumId)),
    )
    const authors = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((r) => r.legacyAuthorId)),
    )

    const skipped: Skip[] = []
    const writable: {
      row: ImportedPostRow
      threadId: number
      forumId: number
      authorId: number | null
    }[] = []

    for (const row of rows) {
      const threadId = threads.get(row.legacyThreadId)
      const forumId = forums.get(row.legacyForumId)

      if (threadId === undefined) {
        skipped.push({
          legacyId: row.legacyId,
          reason: `thread ${row.legacyThreadId} not imported`,
        })
        continue
      }
      if (forumId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `forum ${row.legacyForumId} not imported` })
        continue
      }
      writable.push({ row, threadId, forumId, authorId: authors.get(row.legacyAuthorId) ?? null })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
      insert into posts (
        thread_id, forum_id, author_user_id, author_username,
        message, body_format, created_at, edited_at, visibility, is_first_post,
        legacy_mybb_pid
      )
      values ${sql.join(
        writable.map(
          ({ row, threadId, forumId, authorId }) => sql`(
            ${threadId}, ${forumId}, ${authorId}, ${row.authorUsername},
            ${row.body}, ${BodyFormat.LegacyBBCode}, ${row.createdAt}, ${row.editedAt},
            ${row.visibility}, false, ${row.legacyId}
          )`,
        ),
        sql`, `,
      )}
      on conflict (legacy_mybb_pid) where legacy_mybb_pid is not null do update set
        thread_id = excluded.thread_id,
        forum_id = excluded.forum_id,
        author_user_id = excluded.author_user_id,
        author_username = excluded.author_username,
        message = excluded.message,
        body_format = excluded.body_format,
        edited_at = excluded.edited_at,
        visibility = excluded.visibility
      returning legacy_mybb_pid as legacy_id, id as new_id, (xmax = 0) as inserted
    `),
    )

    await this.#map('post', written)
    await this.#markFirstPosts([...new Set(writable.map((w) => w.threadId))])
    return tally(written, skipped)
  }

  async #map(kind: string, written: readonly Written[]): Promise<void> {
    if (written.length === 0) return

    await this.db.execute(sql`
      insert into legacy_ids (kind, legacy_id, new_id)
      values ${sql.join(
        written.map((row) => sql`(${kind}, ${row.legacy_id}, ${row.new_id})`),
        sql`, `,
      )}
      on conflict (kind, legacy_id) do update set new_id = excluded.new_id
    `)
  }

  async #rebuildPaths(): Promise<void> {
    await this.db.execute(sql`
      with recursive tree as (
        select id, parent_id, id::text as path, 0 as depth
          from forums where parent_id is null
        union all
        select f.id, f.parent_id, t.path || '.' || f.id::text, t.depth + 1
          from forums f join tree t on f.parent_id = t.id
      )
      update forums set path = tree.path, depth = tree.depth
        from tree
       where forums.id = tree.id
         and (forums.path is distinct from tree.path or forums.depth is distinct from tree.depth)
    `)
  }

  async #markFirstPosts(threadIds: readonly number[]): Promise<void> {
    if (threadIds.length === 0) return

    await this.db.execute(sql`
      with ranked as (
        select id, thread_id,
               row_number() over (partition by thread_id order by created_at asc, id asc) = 1 as first
          from posts
         where thread_id in (${sql.join(
           threadIds.map((id) => sql`${id}`),
           sql`, `,
         )})
      )
      update posts set is_first_post = ranked.first
        from ranked
       where posts.id = ranked.id
         and posts.is_first_post is distinct from ranked.first
    `)
  }
}
