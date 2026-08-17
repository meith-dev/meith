import { eq, sql } from 'drizzle-orm'

import { type Database, schema } from '@meith/db'

export type FactoryUser = typeof schema.users.$inferSelect
export type FactoryForum = typeof schema.forums.$inferSelect
export type FactoryThread = typeof schema.threads.$inferSelect
export type FactoryPost = typeof schema.posts.$inferSelect

export interface UserFactoryOptions {
  readonly username?: string
  readonly primaryGroupId?: number
}

export interface ForumFactoryOptions {
  readonly title?: string
  readonly slug?: string
  readonly parent?: FactoryForum
  readonly type?: 'category' | 'forum' | 'link'
}

export interface ThreadFactoryOptions {
  readonly forum?: FactoryForum
  readonly author?: FactoryUser
  readonly title?: string
}

export interface PostFactoryOptions {
  readonly thread?: FactoryThread
  readonly author?: FactoryUser
  readonly message?: string
  readonly isFirstPost?: boolean
}

export function createFactories(db: Database) {
  let nextId = 0
  let registeredGroup: Promise<number> | undefined

  const next = () => ++nextId

  const registeredGroupId = async (): Promise<number> => {
    registeredGroup ??= db
      .select({ id: schema.usergroups.id })
      .from(schema.usergroups)
      .where(eq(schema.usergroups.key, 'registered'))
      .limit(1)
      .then((rows) => {
        const id = rows[0]?.id
        if (id === undefined)
          throw new Error('createFactories: migrations have not seeded registered')
        return id
      })
    return registeredGroup
  }

  const user = async (options: UserFactoryOptions = {}): Promise<FactoryUser> => {
    const n = next()
    const username = options.username ?? `member-${n}`
    const primaryGroupId = options.primaryGroupId ?? (await registeredGroupId())
    const [created] = await db
      .insert(schema.users)
      .values({
        username,
        usernameLower: username.toLowerCase(),
        email: `${username}@example.test`,
        emailLower: `${username}@example.test`,
        primaryGroupId,
        displayGroupId: primaryGroupId,
      })
      .returning()
    if (created === undefined) throw new Error('createFactories: user insert returned no row')
    return created
  }

  const forum = async (options: ForumFactoryOptions = {}): Promise<FactoryForum> => {
    const n = next()
    const parent = options.parent
    const title = options.title ?? `Forum ${n}`
    const [created] = await db
      .insert(schema.forums)
      .values({
        type: options.type ?? 'forum',
        title,
        slug: options.slug ?? `forum-${n}`,
        parentId: parent?.id,
        path: '',
        depth: parent === undefined ? 0 : parent.depth + 1,
      })
      .returning()
    if (created === undefined) throw new Error('createFactories: forum insert returned no row')

    const path = parent === undefined ? String(created.id) : `${parent.path}.${created.id}`
    const [withPath] = await db
      .update(schema.forums)
      .set({ path })
      .where(eq(schema.forums.id, created.id))
      .returning()
    if (withPath === undefined)
      throw new Error('createFactories: forum path update returned no row')
    return withPath
  }

  const thread = async (options: ThreadFactoryOptions = {}): Promise<FactoryThread> => {
    const n = next()
    const forumRow = options.forum ?? (await forum())
    const author = options.author ?? (await user())
    const [created] = await db
      .insert(schema.threads)
      .values({
        forumId: forumRow.id,
        title: options.title ?? `Thread ${n}`,
        slug: `thread-${n}`,
        authorUserId: author.id,
        authorUsername: author.username,
      })
      .returning()
    if (created === undefined) throw new Error('createFactories: thread insert returned no row')
    return created
  }

  const post = async (options: PostFactoryOptions = {}): Promise<FactoryPost> => {
    const threadRow = options.thread ?? (await thread())
    const author = options.author ?? (await user())
    const isFirstPost = options.isFirstPost ?? threadRow.firstPostId === null
    const [created] = await db
      .insert(schema.posts)
      .values({
        threadId: threadRow.id,
        forumId: threadRow.forumId,
        authorUserId: author.id,
        authorUsername: author.username,
        subject: isFirstPost ? threadRow.title : null,
        message: options.message ?? 'Fixture post.',
        isFirstPost,
      })
      .returning()
    if (created === undefined) throw new Error('createFactories: post insert returned no row')

    await db
      .update(schema.threads)
      .set(
        isFirstPost
          ? {
              firstPostId: created.id,
              lastPostId: created.id,
              lastPostUserId: author.id,
              lastPostUsername: author.username,
              lastPostAt: created.createdAt,
            }
          : {
              lastPostId: created.id,
              lastPostUserId: author.id,
              lastPostUsername: author.username,
              lastPostAt: created.createdAt,
              replyCount: sql`${schema.threads.replyCount} + 1`,
            },
      )
      .where(eq(schema.threads.id, threadRow.id))

    return created
  }

  return { user, forum, thread, post }
}
