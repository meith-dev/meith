import { sql } from 'drizzle-orm'

import { BodyFormat } from '@meith/markdown'

import type { Database } from './client'
import { type LegacyKind, resolveLegacyIds } from './import-repo'
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

interface ImportedAvatarRow {
  readonly legacyUserId: number
  readonly source: 'upload' | 'gallery' | 'remote'
  readonly path: string
  readonly width: number | null
  readonly height: number | null
}

interface ImportedAttachmentRow {
  readonly legacyId: number
  readonly legacyPostId: number
  readonly legacyUserId: number
  readonly filename: string
  readonly contentType: string | null
  readonly sizeBytes: number
  readonly path: string
  readonly thumbnailPath: string | null
  readonly downloadCount: number
  readonly createdAt: Date
}

interface ImportedPollRow {
  readonly legacyId: number
  readonly legacyThreadId: number
  readonly question: string
  readonly options: readonly { order: number; label: string; voteCount: number }[]
  readonly closesAt: Date | null
  readonly createdAt: Date
}

interface ImportedPollVoteRow {
  readonly legacyPollId: number
  readonly legacyUserId: number
  readonly optionOrder: number
  readonly votedAt: Date | null
}

interface ImportedPrivateMessageRow {
  readonly legacyId: number
  readonly legacyAuthorId: number
  readonly subject: string
  readonly body: string
  readonly sentAt: Date
  readonly copies: readonly {
    readonly legacyOwnerId: number
    readonly folder: 'inbox' | 'sent' | 'trash'
    readonly readAt: Date | null
  }[]
}

interface ImportedSubscriptionRow {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyTargetId: number
  readonly mode: 'instant' | 'none'
}

interface ImportedReputationRow {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyGivenByUserId: number
  readonly legacyPostId: number | null
  readonly points: number
  readonly comment: string
  readonly createdAt: Date
}

interface ImportedWarningRow {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyIssuedByUserId: number
  readonly legacyPostId: number | null
  readonly title: string
  readonly points: number
  readonly notes: string
  readonly issuedAt: Date
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokeReason: string | null
}

interface ImportedBanRow {
  readonly legacyId: number
  readonly legacyUserId: number
  readonly legacyBannedByUserId: number
  readonly reason: string
  readonly publicReason: string | null
  readonly createdAt: Date
  readonly expiresAt: Date | null
}

interface ImportedUserRelationRow {
  readonly legacyUserId: number
  readonly legacyOtherUserId: number
  readonly kind: 'buddy' | 'ignore'
}

export type CopiedAttachment =
  | {
      readonly outcome: 'ready'
      readonly storageKey: string
      readonly thumbnailKey: string | null
      readonly contentType: string
      readonly sizeBytes: number
      readonly width: number | null
      readonly height: number | null
    }
  | { readonly outcome: 'missing' | 'failed'; readonly reason: string }

export type CopiedAvatar =
  | {
      readonly outcome: 'ready'
      readonly key: string
      readonly width: number | null
      readonly height: number | null
    }
  | { readonly outcome: 'missing' | 'failed'; readonly reason: string }

export interface ImportFileCopier {
  attachment(input: {
    readonly legacyId: number
    readonly path: string
    readonly thumbnailPath: string | null
    readonly filename: string
    readonly contentType: string | null
  }): Promise<CopiedAttachment>
  avatar(input: { readonly legacyUserId: number; readonly path: string }): Promise<CopiedAvatar>
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

function missingGroup(key: string): string {
  return `No "${key}" usergroup. Run migrations before importing.`
}

function algoOf(legacyPasswordHash: string): string {
  const separator = legacyPasswordHash.indexOf('$')
  return separator <= 0 ? 'mybb' : legacyPasswordHash.slice(0, separator)
}

export class PostgresImportSink {
  readonly #copier: ImportFileCopier | null

  constructor(
    private readonly db: Database,
    options?: { readonly copier?: ImportFileCopier | undefined },
  ) {
    this.#copier = options?.copier ?? null
  }

  async putUsers(rows: readonly ImportedUserRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const groupRows = resultRows<{ id: number }>(
      await this.db.execute(sql`select id from usergroups where key = 'registered' limit 1`),
    )

    const groupId = groupRows[0]?.id
    if (groupId === undefined) {
      throw new Error(missingGroup('registered'))
    }

    const taken = resultRows<{
      username_lower: string
      email_lower: string
      legacy_id: number | null
    }>(
      await this.db.execute(sql`
      select username_lower, email_lower, legacy_id from users
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

    const byName = new Map(taken.map((row) => [row.username_lower, row.legacy_id]))
    const byEmail = new Map(taken.map((row) => [row.email_lower, row.legacy_id]))

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
        post_count, created_at, last_active_at, legacy_id
      )
      values ${sql.join(
        writable.map(
          (row) => sql`(
            ${row.username}, ${row.username.toLowerCase()},
            ${row.email}, ${row.email.toLowerCase()},
            ${row.legacyPasswordHash}, ${algoOf(row.legacyPasswordHash)},
            ${groupId}, ${groupId},
            ${row.postCount}, ${row.registeredAt}, ${row.lastVisitAt},
            ${row.legacyId}
          )`,
        ),
        sql`, `,
      )}
      on conflict (legacy_id) where legacy_id is not null do update set
        username = excluded.username,
        username_lower = excluded.username_lower,
        email = excluded.email,
        email_lower = excluded.email_lower,
        password_hash = excluded.password_hash,
        password_algo = excluded.password_algo,
        post_count = excluded.post_count
      returning legacy_id, id as new_id, (xmax = 0) as inserted
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
        display_order, link_url, allow_threads, legacy_id
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
      on conflict (legacy_id) where legacy_id is not null do update set
        type = excluded.type,
        title = excluded.title,
        description = excluded.description,
        parent_id = excluded.parent_id,
        display_order = excluded.display_order,
        link_url = excluded.link_url
      returning legacy_id, id as new_id, (xmax = 0) as inserted
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
        is_sticky, is_locked, visibility, legacy_id
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
      on conflict (legacy_id) where legacy_id is not null do update set
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
      returning legacy_id, id as new_id, (xmax = 0) as inserted
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
        legacy_id
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
      on conflict (legacy_id) where legacy_id is not null do update set
        thread_id = excluded.thread_id,
        forum_id = excluded.forum_id,
        author_user_id = excluded.author_user_id,
        author_username = excluded.author_username,
        message = excluded.message,
        body_format = excluded.body_format,
        edited_at = excluded.edited_at,
        visibility = excluded.visibility
      returning legacy_id, id as new_id, (xmax = 0) as inserted
    `),
    )

    await this.#map('post', written)
    await this.#markFirstPosts([...new Set(writable.map((w) => w.threadId))])
    return tally(written, skipped)
  }

  async putAvatars(rows: readonly ImportedAvatarRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((row) => row.legacyUserId)),
    )

    const skipped: Skip[] = []
    let updated = 0

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      if (userId === undefined) {
        skipped.push({ legacyId: row.legacyUserId, reason: 'member not imported' })
        continue
      }
      if (row.source === 'remote') {
        skipped.push({
          legacyId: row.legacyUserId,
          reason: `remote avatar ${row.path} not migrated`,
        })
        continue
      }
      if (this.#copier === null) {
        skipped.push({
          legacyId: row.legacyUserId,
          reason: `avatar file ${row.path} not copied — re-run with --uploads-dir`,
        })
        continue
      }

      const copied = await this.#copier.avatar({ legacyUserId: row.legacyUserId, path: row.path })
      if (copied.outcome !== 'ready') {
        skipped.push({ legacyId: row.legacyUserId, reason: copied.reason })
        continue
      }

      await this.db.execute(sql`
        update users
           set avatar_status = 'ready',
               avatar_key = ${copied.key},
               avatar_source_key = null,
               avatar_width = ${copied.width ?? row.width},
               avatar_height = ${copied.height ?? row.height},
               avatar_failure_reason = null,
               avatar_updated_at = now()
         where id = ${userId}
      `)
      updated += 1
    }

    return { inserted: 0, updated, skipped }
  }

  async putAttachments(rows: readonly ImportedAttachmentRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const posts = await resolveLegacyIds(
      this.db,
      'post',
      parentIds(rows.map((row) => row.legacyPostId)),
    )
    const uploaders = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((row) => row.legacyUserId)),
    )

    const forumOf = new Map<number, number>()
    if (posts.size > 0) {
      const postRows = resultRows<{ id: number; forum_id: number }>(
        await this.db.execute(sql`
          select id, forum_id from posts
          where id in (${sql.join(
            [...posts.values()].map((id) => sql`${id}`),
            sql`, `,
          )})
        `),
      )
      for (const row of postRows) forumOf.set(Number(row.id), Number(row.forum_id))
    }

    const skipped: Skip[] = []
    const written: Written[] = []

    for (const row of rows) {
      const postId = posts.get(row.legacyPostId)
      const forumId = postId === undefined ? undefined : forumOf.get(postId)
      if (postId === undefined || forumId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `post ${row.legacyPostId} not imported` })
        continue
      }

      const copied: CopiedAttachment =
        this.#copier === null
          ? {
              outcome: 'missing',
              reason: `legacy file ${row.path} not copied — re-run with --uploads-dir`,
            }
          : await this.#copier.attachment({
              legacyId: row.legacyId,
              path: row.path,
              thumbnailPath: row.thumbnailPath,
              filename: row.filename,
              contentType: row.contentType,
            })

      const ready = copied.outcome === 'ready'
      const contentType = ready
        ? copied.contentType
        : (row.contentType ?? 'application/octet-stream')

      const result = resultRows<Written>(
        await this.db.execute(sql`
          insert into attachments (
            post_id, forum_id, uploader_user_id, filename, content_type, size_bytes,
            storage_key, thumbnail_key, width, height, status, failure_reason,
            download_count, created_at, ready_at, legacy_id
          )
          values (
            ${postId}, ${forumId}, ${uploaders.get(row.legacyUserId) ?? null},
            ${row.filename}, ${contentType},
            ${ready ? copied.sizeBytes : row.sizeBytes},
            ${ready ? copied.storageKey : null}, ${ready ? copied.thumbnailKey : null},
            ${ready ? copied.width : null}, ${ready ? copied.height : null},
            ${ready ? 'ready' : 'failed'}, ${ready ? null : copied.reason},
            ${row.downloadCount}, ${row.createdAt}, ${ready ? sql`now()` : null},
            ${row.legacyId}
          )
          on conflict (legacy_id) where legacy_id is not null do update set
            post_id = excluded.post_id,
            forum_id = excluded.forum_id,
            uploader_user_id = excluded.uploader_user_id,
            filename = excluded.filename,
            download_count = excluded.download_count,
            content_type = case
              when excluded.status = 'ready' then excluded.content_type
              else attachments.content_type end,
            size_bytes = case
              when excluded.status = 'ready' then excluded.size_bytes
              else attachments.size_bytes end,
            storage_key = case
              when excluded.status = 'ready' then excluded.storage_key
              else attachments.storage_key end,
            thumbnail_key = case
              when excluded.status = 'ready' then excluded.thumbnail_key
              else attachments.thumbnail_key end,
            width = case
              when excluded.status = 'ready' then excluded.width
              else attachments.width end,
            height = case
              when excluded.status = 'ready' then excluded.height
              else attachments.height end,
            ready_at = case
              when excluded.status = 'ready' then excluded.ready_at
              else attachments.ready_at end,
            status = case
              when excluded.status = 'ready' or attachments.status = 'ready' then 'ready'
              else excluded.status end,
            failure_reason = case
              when excluded.status = 'ready' or attachments.status = 'ready' then null
              else excluded.failure_reason end
          returning legacy_id, id as new_id, (xmax = 0) as inserted
        `),
      )
      written.push(...result)
    }

    await this.#map('attachment', written)
    return tally(written, skipped)
  }

  async putPolls(rows: readonly ImportedPollRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const threads = await resolveLegacyIds(
      this.db,
      'thread',
      parentIds(rows.map((row) => row.legacyThreadId)),
    )

    const skipped: Skip[] = []
    const written: Written[] = []

    for (const row of rows) {
      const threadId = threads.get(row.legacyThreadId)
      if (threadId === undefined) {
        skipped.push({
          legacyId: row.legacyId,
          reason: `thread ${row.legacyThreadId} not imported`,
        })
        continue
      }

      const result = resultRows<Written>(
        await this.db.execute(sql`
          insert into polls (thread_id, question, closes_at, created_at, legacy_id)
          values (${threadId}, ${row.question}, ${row.closesAt}, ${row.createdAt}, ${row.legacyId})
          on conflict (legacy_id) where legacy_id is not null do update set
            thread_id = excluded.thread_id,
            question = excluded.question,
            closes_at = excluded.closes_at
          returning legacy_id, id as new_id, (xmax = 0) as inserted
        `),
      )

      const poll = result[0]
      if (poll === undefined) continue
      written.push(poll)

      await this.db.execute(sql`
        insert into poll_options (poll_id, label, display_order, vote_count)
        values ${sql.join(
          row.options.map(
            (option) =>
              sql`(${poll.new_id}, ${option.label}, ${option.order}, ${option.voteCount})`,
          ),
          sql`, `,
        )}
        on conflict (poll_id, display_order) do update set
          label = excluded.label,
          vote_count = excluded.vote_count
      `)
    }

    await this.#map('poll', written)
    return tally(written, skipped)
  }

  async putPollVotes(rows: readonly ImportedPollVoteRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const polls = await resolveLegacyIds(
      this.db,
      'poll',
      parentIds(rows.map((row) => row.legacyPollId)),
    )
    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((row) => row.legacyUserId)),
    )

    const options = new Map<string, number>()
    if (polls.size > 0) {
      const optionRows = resultRows<{ poll_id: number; display_order: number; id: number }>(
        await this.db.execute(sql`
          select poll_id, display_order, id from poll_options
          where poll_id in (${sql.join(
            [...polls.values()].map((id) => sql`${id}`),
            sql`, `,
          )})
        `),
      )
      for (const row of optionRows) {
        options.set(`${row.poll_id}:${row.display_order}`, Number(row.id))
      }
    }

    const skipped: Skip[] = []
    const writable: { pollId: number; userId: number; optionId: number; votedAt: Date | null }[] =
      []

    for (const row of rows) {
      const pollId = polls.get(row.legacyPollId)
      const userId = users.get(row.legacyUserId)
      const optionId =
        pollId === undefined ? undefined : options.get(`${pollId}:${row.optionOrder}`)

      if (pollId === undefined) {
        skipped.push({ legacyId: row.legacyPollId, reason: 'poll not imported' })
        continue
      }
      if (userId === undefined) {
        skipped.push({
          legacyId: row.legacyPollId,
          reason: `member ${row.legacyUserId} not imported`,
        })
        continue
      }
      if (optionId === undefined) {
        skipped.push({
          legacyId: row.legacyPollId,
          reason: `option ${row.optionOrder} does not exist`,
        })
        continue
      }
      writable.push({ pollId, userId, optionId, votedAt: row.votedAt })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const inserted = resultRows<{ poll_id: number }>(
      await this.db.execute(sql`
        insert into poll_votes (poll_id, user_id, option_id, created_at)
        values ${sql.join(
          writable.map(
            (vote) =>
              sql`(${vote.pollId}, ${vote.userId}, ${vote.optionId}, ${vote.votedAt ?? sql`now()`})`,
          ),
          sql`, `,
        )}
        on conflict (poll_id, user_id) do nothing
        returning poll_id
      `),
    )

    return { inserted: inserted.length, updated: writable.length - inserted.length, skipped }
  }

  async putPrivateMessages(rows: readonly ImportedPrivateMessageRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const authorIds = parentIds(rows.map((row) => row.legacyAuthorId))
    const ownerIds = parentIds(rows.flatMap((row) => row.copies.map((copy) => copy.legacyOwnerId)))
    const users = await resolveLegacyIds(this.db, 'user', [...new Set([...authorIds, ...ownerIds])])

    const usernames = new Map<number, string>()
    if (users.size > 0) {
      const nameRows = resultRows<{ id: number; username: string }>(
        await this.db.execute(sql`
          select id, username from users
          where id in (${sql.join(
            [...users.values()].map((id) => sql`${id}`),
            sql`, `,
          )})
        `),
      )
      for (const row of nameRows) usernames.set(Number(row.id), row.username)
    }

    const written = resultRows<Written>(
      await this.db.execute(sql`
        insert into private_messages (
          author_user_id, author_username, subject, message, body_format, sent_at, legacy_id
        )
        values ${sql.join(
          rows.map((row) => {
            const authorId = users.get(row.legacyAuthorId) ?? null
            return sql`(
              ${authorId}, ${authorId === null ? '' : (usernames.get(authorId) ?? '')},
              ${row.subject}, ${row.body}, ${BodyFormat.LegacyBBCode}, ${row.sentAt},
              ${row.legacyId}
            )`
          }),
          sql`, `,
        )}
        on conflict (legacy_id) where legacy_id is not null do update set
          author_user_id = excluded.author_user_id,
          author_username = excluded.author_username,
          subject = excluded.subject,
          message = excluded.message,
          sent_at = excluded.sent_at
        returning legacy_id, id as new_id, (xmax = 0) as inserted
      `),
    )

    await this.#map('pm', written)

    const messageIds = new Map(written.map((row) => [Number(row.legacy_id), Number(row.new_id)]))
    const skipped: Skip[] = []
    const copies: {
      messageId: number
      ownerId: number
      authorOwned: boolean
      folder: string
      readAt: Date | null
    }[] = []

    for (const row of rows) {
      const messageId = messageIds.get(row.legacyId)
      if (messageId === undefined) continue
      for (const copy of row.copies) {
        const ownerId = users.get(copy.legacyOwnerId)
        if (ownerId === undefined) {
          skipped.push({
            legacyId: row.legacyId,
            reason: `recipient ${copy.legacyOwnerId} not imported`,
          })
          continue
        }
        copies.push({
          messageId,
          ownerId,
          authorOwned: copy.legacyOwnerId === row.legacyAuthorId,
          folder: copy.folder,
          readAt: copy.readAt,
        })
      }
    }

    if (copies.length > 0) {
      await this.db.execute(sql`
        insert into private_message_copies (message_id, owner_user_id, folder, role, read_at)
        values ${sql.join(
          copies.map(
            (copy) => sql`(
              ${copy.messageId}, ${copy.ownerId}, ${copy.folder},
              ${copy.authorOwned ? 'author' : 'to'}, ${copy.readAt}
            )`,
          ),
          sql`, `,
        )}
        on conflict (message_id, owner_user_id) do update set
          folder = excluded.folder,
          read_at = excluded.read_at
      `)
    }

    return tally(written, skipped)
  }

  putThreadSubscriptions(rows: readonly ImportedSubscriptionRow[]): Promise<WriteResult> {
    return this.#putSubscriptions(rows, 'thread')
  }

  putForumSubscriptions(rows: readonly ImportedSubscriptionRow[]): Promise<WriteResult> {
    return this.#putSubscriptions(rows, 'forum')
  }

  async putReputation(rows: readonly ImportedReputationRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds([
        ...rows.map((row) => row.legacyUserId),
        ...rows.map((row) => row.legacyGivenByUserId),
      ]),
    )
    const posts = await resolveLegacyIds(
      this.db,
      'post',
      parentIds(rows.map((row) => row.legacyPostId)),
    )

    const skipped: Skip[] = []
    const writable: { row: ImportedReputationRow; userId: number }[] = []

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      if (userId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `member ${row.legacyUserId} not imported` })
        continue
      }
      writable.push({ row, userId })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
        insert into reputation (
          user_id, given_by_user_id, post_id, points, comment, created_at, legacy_id
        )
        values ${sql.join(
          writable.map(
            ({ row, userId }) => sql`(
              ${userId}, ${users.get(row.legacyGivenByUserId) ?? null},
              ${row.legacyPostId === null ? null : (posts.get(row.legacyPostId) ?? null)},
              ${row.points}, ${row.comment}, ${row.createdAt}, ${row.legacyId}
            )`,
          ),
          sql`, `,
        )}
        on conflict (legacy_id) where legacy_id is not null do update set
          points = excluded.points,
          comment = excluded.comment
        returning legacy_id, id as new_id, (xmax = 0) as inserted
      `),
    )

    await this.#recountReputation([...new Set(writable.map(({ userId }) => userId))])
    return tally(written, skipped)
  }

  async putWarnings(rows: readonly ImportedWarningRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds([
        ...rows.map((row) => row.legacyUserId),
        ...rows.map((row) => row.legacyIssuedByUserId),
      ]),
    )
    const posts = await resolveLegacyIds(
      this.db,
      'post',
      parentIds(rows.map((row) => row.legacyPostId)),
    )

    const skipped: Skip[] = []
    const writable: { row: ImportedWarningRow; userId: number }[] = []

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      if (userId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `member ${row.legacyUserId} not imported` })
        continue
      }
      writable.push({ row, userId })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const written = resultRows<Written>(
      await this.db.execute(sql`
        insert into warnings (
          user_id, issued_by_user_id, title, points, reason, post_id,
          created_at, expires_at, revoked_at, revoke_reason, legacy_id
        )
        values ${sql.join(
          writable.map(
            ({ row, userId }) => sql`(
              ${userId}, ${users.get(row.legacyIssuedByUserId) ?? null},
              ${row.title}, ${row.points}, ${row.notes},
              ${row.legacyPostId === null ? null : (posts.get(row.legacyPostId) ?? null)},
              ${row.issuedAt}, ${row.expiresAt}, ${row.revokedAt}, ${row.revokeReason},
              ${row.legacyId}
            )`,
          ),
          sql`, `,
        )}
        on conflict (legacy_id) where legacy_id is not null do update set
          title = excluded.title,
          points = excluded.points,
          reason = excluded.reason,
          expires_at = excluded.expires_at,
          revoked_at = excluded.revoked_at,
          revoke_reason = excluded.revoke_reason
        returning legacy_id, id as new_id, (xmax = 0) as inserted
      `),
    )

    await this.#recountWarningPoints([...new Set(writable.map(({ userId }) => userId))])
    return tally(written, skipped)
  }

  async putBans(rows: readonly ImportedBanRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const groups = resultRows<{ id: number; key: string }>(
      await this.db.execute(sql`select id, key from usergroups where key = 'banned' limit 1`),
    )
    const bannedGroupId = groups[0]?.id
    if (bannedGroupId === undefined) {
      throw new Error(missingGroup('banned'))
    }

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds([
        ...rows.map((row) => row.legacyUserId),
        ...rows.map((row) => row.legacyBannedByUserId),
      ]),
    )

    const activeBans = new Map<number, number | null>()
    if (users.size > 0) {
      const activeRows = resultRows<{ user_id: number; legacy_id: number | null }>(
        await this.db.execute(sql`
          select user_id, legacy_id from bans
          where lifted_at is null
            and user_id in (${sql.join(
              [...users.values()].map((id) => sql`${id}`),
              sql`, `,
            )})
        `),
      )
      for (const row of activeRows) {
        activeBans.set(Number(row.user_id), row.legacy_id === null ? null : Number(row.legacy_id))
      }
    }

    const skipped: Skip[] = []
    const written: Written[] = []

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      if (userId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `member ${row.legacyUserId} not imported` })
        continue
      }

      const existing = activeBans.get(userId)
      if (existing !== undefined && existing !== row.legacyId) {
        skipped.push({ legacyId: row.legacyId, reason: 'member already has an active ban' })
        continue
      }

      const result = resultRows<Written & { active: boolean }>(
        await this.db.execute(sql`
          insert into bans (
            user_id, banned_by_user_id, reason, public_reason,
            previous_primary_group_id, expires_at, created_at, legacy_id
          )
          select ${userId}, ${users.get(row.legacyBannedByUserId) ?? null},
                 ${row.reason}, ${row.publicReason},
                 case when u.primary_group_id = ${bannedGroupId} then null
                      else u.primary_group_id end,
                 ${row.expiresAt}, ${row.createdAt}, ${row.legacyId}
            from users u where u.id = ${userId}
          on conflict (legacy_id) where legacy_id is not null do update set
            reason = excluded.reason,
            public_reason = excluded.public_reason,
            expires_at = excluded.expires_at
          returning legacy_id, id as new_id, (xmax = 0) as inserted,
                    lifted_at is null as active
        `),
      )

      const ban = result[0]
      if (ban === undefined) continue
      written.push(ban)
      activeBans.set(userId, row.legacyId)

      if (ban.active) {
        await this.db.execute(sql`
          update users
             set primary_group_id = ${bannedGroupId}, display_group_id = ${bannedGroupId}
           where id = ${userId}
        `)
      }
    }

    return tally(written, skipped)
  }

  async putUserRelations(rows: readonly ImportedUserRelationRow[]): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds([
        ...rows.map((row) => row.legacyUserId),
        ...rows.map((row) => row.legacyOtherUserId),
      ]),
    )

    const skipped: Skip[] = []
    const writable: { userId: number; otherUserId: number; kind: string }[] = []

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      const otherUserId = users.get(row.legacyOtherUserId)
      if (userId === undefined || otherUserId === undefined) {
        skipped.push({
          legacyId: row.legacyUserId,
          reason: `member ${userId === undefined ? row.legacyUserId : row.legacyOtherUserId} not imported`,
        })
        continue
      }
      writable.push({ userId, otherUserId, kind: row.kind })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const inserted = resultRows<{ user_id: number; inserted: boolean }>(
      await this.db.execute(sql`
        insert into user_relations (user_id, other_user_id, kind)
        values ${sql.join(
          writable.map((row) => sql`(${row.userId}, ${row.otherUserId}, ${row.kind})`),
          sql`, `,
        )}
        on conflict (user_id, other_user_id) do update set kind = excluded.kind
        returning user_id, (xmax = 0) as inserted
      `),
    )

    return {
      inserted: inserted.filter((row) => row.inserted).length,
      updated: inserted.filter((row) => !row.inserted).length,
      skipped,
    }
  }

  async #putSubscriptions(
    rows: readonly ImportedSubscriptionRow[],
    target: 'thread' | 'forum',
  ): Promise<WriteResult> {
    if (rows.length === 0) return empty

    const users = await resolveLegacyIds(
      this.db,
      'user',
      parentIds(rows.map((row) => row.legacyUserId)),
    )
    const targets = await resolveLegacyIds(
      this.db,
      target,
      parentIds(rows.map((row) => row.legacyTargetId)),
    )

    const skipped: Skip[] = []
    const writable: { userId: number; targetId: number; mode: string }[] = []

    for (const row of rows) {
      const userId = users.get(row.legacyUserId)
      const targetId = targets.get(row.legacyTargetId)
      if (userId === undefined) {
        skipped.push({ legacyId: row.legacyId, reason: `member ${row.legacyUserId} not imported` })
        continue
      }
      if (targetId === undefined) {
        skipped.push({
          legacyId: row.legacyId,
          reason: `${target} ${row.legacyTargetId} not imported`,
        })
        continue
      }
      writable.push({ userId, targetId, mode: row.mode === 'none' ? 'none' : 'instant' })
    }

    if (writable.length === 0) return { ...empty, skipped }

    const table = target === 'thread' ? sql`thread_subscriptions` : sql`forum_subscriptions`
    const column = target === 'thread' ? sql`thread_id` : sql`forum_id`

    const written = resultRows<{ inserted: boolean }>(
      await this.db.execute(sql`
        insert into ${table} (user_id, ${column}, mode)
        values ${sql.join(
          writable.map((row) => sql`(${row.userId}, ${row.targetId}, ${row.mode})`),
          sql`, `,
        )}
        on conflict (user_id, ${column}) do update set mode = excluded.mode
        returning (xmax = 0) as inserted
      `),
    )

    return {
      inserted: written.filter((row) => row.inserted).length,
      updated: written.filter((row) => !row.inserted).length,
      skipped,
    }
  }

  async #recountReputation(userIds: readonly number[]): Promise<void> {
    if (userIds.length === 0) return
    await this.db.execute(sql`
      update users u
         set reputation = coalesce(
               (select sum(r.points)::int from reputation r where r.user_id = u.id), 0)
       where u.id in (${sql.join(
         userIds.map((id) => sql`${id}`),
         sql`, `,
       )})
    `)
  }

  async #recountWarningPoints(userIds: readonly number[]): Promise<void> {
    if (userIds.length === 0) return
    await this.db.execute(sql`
      update users u
         set warning_points = coalesce((
               select sum(w.points)::int from warnings w
                where w.user_id = u.id
                  and w.revoked_at is null
                  and (w.expires_at is null or w.expires_at > now())
             ), 0)
       where u.id in (${sql.join(
         userIds.map((id) => sql`${id}`),
         sql`, `,
       )})
    `)
  }

  async #map(kind: LegacyKind, written: readonly Written[]): Promise<void> {
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
