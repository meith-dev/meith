import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  PostEditRecord,
  PostEditTarget,
  PostVisibilityRecord,
  PostWriteRepository,
} from '@meith/posts'
import type {
  CreatedThread,
  ForumPostingTarget,
  NewReplyRecord,
  NewThreadRecord,
  ReplyTarget,
  ReplyWriteRepository,
  ThreadWriteRepository,
} from '@meith/threads'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({
  getActor: async () => actorRef.current,
}))

const {
  createReplyAction,
  createThreadAction,
  deletePostAction,
  editPostAction,
  restorePostAction,
} = await import('./content-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')

const { installTestContainer, CONTAINER_KEY } = await import('./test-container')

class FakeWrites implements ThreadWriteRepository, ReplyWriteRepository {
  readonly written: NewThreadRecord[] = []
  readonly replies: NewReplyRecord[] = []
  thread: Partial<ReplyTarget> = {}
  constructor(private readonly rules: Partial<ForumPostingTarget> = {}) {}

  async replyTarget(threadId: number): Promise<ReplyTarget | null> {
    if (threadId === 4242) return null
    const forum = (await this.postingRules(
      this.thread.forum?.id ?? SEED_FORUM.general,
    ))!
    return {
      threadId,
      slug: 'hello',
      title: 'Hello',
      authorUserId: null,
      isLocked: false,
      visibility: 'visible',
      lastPostId: 31,
      replyCount: 1,
      ...this.thread,
      forum,
    }
  }

  async createReply(record: NewReplyRecord): Promise<{ postId: number }> {
    this.replies.push(record)
    return { postId: 99 }
  }

  async postingRules(forumId: number): Promise<ForumPostingTarget | null> {
    if (forumId === 4242) return null
    return {
      id: forumId,
      type: 'forum',
      slug: 'general',
      isOpen: true,
      allowThreads: true,
      allowReplies: true,
      allowPolls: true,
      requiresPrefix: false,
      moderateNewThreads: false,
      moderateNewPosts: false,
      ...this.rules,
    }
  }

  async create(record: NewThreadRecord): Promise<CreatedThread> {
    this.written.push(record)
    return { threadId: 77, postId: 88, slug: record.slug, visibility: record.visibility }
  }

  async lastPostAt(): Promise<Date | null> {
    return null
  }

  async allowedPrefixIds(): Promise<readonly number[]> {
    return []
  }

  async listPrefixes(): Promise<readonly { id: number; label: string; token: null }[]> {
    return []
  }
}

let writes: FakeWrites

class FakeDrafts {
  readonly saved: Array<{ userId: number; draft: unknown }> = []
  async save(userId: number, draft: unknown): Promise<void> { this.saved.push({ userId, draft }) }
  async remove(): Promise<void> {}
  async find(): Promise<null> { return null }
}

function installContainer(
  overrides: Record<string, unknown> = {},
  board = SEED_BOARD,
): void {
  installTestContainer({
    board,
    container: {
      threadWrites: writes,
      memberProfiles: {
        findPublicById: async (id: number) =>
          id === 1 ? { id, username: 'ada', joinedAt: new Date(), postCount: 0 } : null,
      },
      ...overrides,
    },
  })
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const VALID = {
  forumId: String(SEED_FORUM.general),
  title: 'A thread about testing',
  message: 'With a message in it.',
}

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (err) {
    if (err instanceof RedirectError) return err.location
    throw err
  }
  throw new Error('expected a redirect')
}

beforeEach(async () => {
  writes = new FakeWrites()
  actorRef.current = await actorFor(SEED_GROUP.registered, 1)
  installContainer()
})

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTAINER_KEY]
})

describe('createThreadAction', () => {
  it('saves an explicit native draft without creating a thread', async () => {
    const drafts = new FakeDrafts()
    installContainer({ drafts })

    await expect(createThreadAction(EMPTY_STATE, form({ ...VALID, intent: 'save_draft' })))
      .resolves.toMatchObject({ notice: 'saved' })
    expect(writes.written).toEqual([])
    expect(drafts.saved[0]).toMatchObject({ userId: 1, draft: { title: VALID.title, message: VALID.message } })
  })

  it('creates the thread and redirects to it', async () => {
    const to = await redirectOf(createThreadAction(EMPTY_STATE, form(VALID)))

    expect(to).toBe('/thread/77-a-thread-about-testing')
    expect(writes.written[0]).toMatchObject({
      forumId: SEED_FORUM.general,
      title: 'A thread about testing',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
    })
  })

  it('subscribes when the box is ticked, and not when it is absent', async () => {
    await redirectOf(createThreadAction(EMPTY_STATE, form({ ...VALID, subscribe: '1' })))
    expect(writes.written[0]!.subscribe).toBe(true)

    await redirectOf(createThreadAction(EMPTY_STATE, form(VALID)))
    expect(writes.written[1]!.subscribe).toBe(false)
  })

  it('refuses a guest, however the form was submitted', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const state = await createThreadAction(EMPTY_STATE, form(VALID))

    expect(state.error).toBeTruthy()
    expect(writes.written).toEqual([])
  })

  it('refuses a member who may read a forum but not post in it', async () => {
    const state = await createThreadAction(
      EMPTY_STATE,
      form({ ...VALID, forumId: String(SEED_FORUM.announcements) }),
    )

    expect(state.error).toBeTruthy()
    expect(writes.written).toEqual([])
  })

  it('does not confirm that a forum it cannot see exists', async () => {
    const hidden = 555
    installContainer(
      {},
      {
        ...SEED_BOARD,
        chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
        overrides: [
          ...SEED_BOARD.overrides,
          { forumId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
        ],
      },
    )

    const state = await createThreadAction(
      EMPTY_STATE,
      form({ ...VALID, forumId: String(hidden) }),
    )

    expect(state.error).toBe('That forum does not exist.')
    expect(writes.written).toEqual([])
  })

  it('refuses a forum that does not exist at all', async () => {
    const state = await createThreadAction(EMPTY_STATE, form({ ...VALID, forumId: '4242' }))

    expect(state.error).toBe('That forum does not exist.')
    expect(writes.written).toEqual([])
  })

  it('rejects a forum id that is not one', async () => {
    for (const forumId of ['0', '-3', 'abc', '1e3', '']) {
      const state = await createThreadAction(EMPTY_STATE, form({ ...VALID, forumId }))
      expect(state.error).toBeTruthy()
    }
    expect(writes.written).toEqual([])
  })

  it('returns the domain error and keeps what was typed', async () => {
    const state = await createThreadAction(
      EMPTY_STATE,
      form({ ...VALID, title: 'ab' }),
    )

    expect(state.error).toMatch(/at least 3 characters/)
    expect(state.values?.message).toBe('With a message in it.')
    expect(writes.written).toEqual([])
  })

  it('sends a held thread to its forum rather than to a page that 404s', async () => {
    writes = new FakeWrites({ moderateNewThreads: true })
    installContainer()

    const to = await redirectOf(createThreadAction(EMPTY_STATE, form(VALID)))

    expect(to).toBe(`/${SEED_FORUM.general}-general?posted=moderated`)
    expect(writes.written[0]!.visibility).toBe('unapproved')
  })

  it('previews without writing anything', async () => {
    const state = await createThreadAction(
      EMPTY_STATE,
      form({ ...VALID, intent: 'preview' }),
    )

    expect(state.notice).toBe('preview')
    expect(state.values?.message).toBe('With a message in it.')
    expect(writes.written).toEqual([])
  })

  it('refuses when the board has no writer at all', async () => {
    installContainer({ threadWrites: null })

    const state = await createThreadAction(EMPTY_STATE, form(VALID))

    expect(state.error).toMatch(/sample data/)
  })
})

describe('createReplyAction', () => {
  it('saves an explicit reply draft without creating a post', async () => {
    const drafts = new FakeDrafts()
    installContainer({ drafts })

    await expect(createReplyAction(EMPTY_STATE, form({ ...REPLY, intent: 'save_draft' })))
      .resolves.toMatchObject({ notice: 'saved' })
    expect(writes.replies).toEqual([])
    expect(drafts.saved[0]).toMatchObject({ userId: 1, draft: { threadId: Number(REPLY.threadId), message: REPLY.message } })
  })

  const REPLY = { threadId: '20', message: 'Quite so.', seenLastPostId: '31' }

  it('posts the reply and returns to the thread, anchored to it', async () => {
    const to = await redirectOf(createReplyAction(EMPTY_STATE, form(REPLY)))

    expect(to).toBe('/thread/20-hello?post=99')
    expect(writes.replies[0]).toMatchObject({
      threadId: 20,
      forumId: SEED_FORUM.general,
      message: 'Quite so.',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
    })
  })

  it('says so when somebody replied while the form was open', async () => {
    const to = await redirectOf(
      createReplyAction(EMPTY_STATE, form({ ...REPLY, seenLastPostId: '30' })),
    )

    expect(to).toBe('/thread/20-hello?post=99&replied=race')
    expect(writes.replies).toHaveLength(1)
  })

  it('opens a page at the reply once the thread is longer than one', async () => {
    writes.thread = { replyCount: 40 }

    const to = await redirectOf(createReplyAction(EMPTY_STATE, form(REPLY)))

    expect(to).toBe('/thread/20-hello?post=99')
  })

  it('refuses a member who may read a thread but not reply to it', async () => {
    writes.thread = { forum: { id: SEED_FORUM.announcements } as ReplyTarget['forum'] }

    const state = await createReplyAction(EMPTY_STATE, form(REPLY))

    expect(state.error).toBeTruthy()
    expect(writes.replies).toEqual([])
  })

  it('refuses a locked thread, and lets a moderator through', async () => {
    writes.thread = { isLocked: true }
    expect((await createReplyAction(EMPTY_STATE, form(REPLY))).error).toMatch(/locked/)

    actorRef.current = await actorFor(SEED_GROUP.superModerators, 1)
    await redirectOf(createReplyAction(EMPTY_STATE, form(REPLY)))
    expect(writes.replies).toHaveLength(1)
  })

  it('refuses a thread that does not exist', async () => {
    const state = await createReplyAction(EMPTY_STATE, form({ ...REPLY, threadId: '4242' }))

    expect(state.error).toBe('That thread does not exist.')
  })

  it('previews without writing anything', async () => {
    const state = await createReplyAction(
      EMPTY_STATE,
      form({ ...REPLY, intent: 'preview' }),
    )

    expect(state.notice).toBe('preview')
    expect(writes.replies).toEqual([])
  })

  it('keeps the draft when the message is rejected', async () => {
    const state = await createReplyAction(EMPTY_STATE, form({ ...REPLY, message: '' }))

    expect(state.error).toBeTruthy()
    expect(state.values?.message).toBe('')
    expect(writes.replies).toEqual([])
  })
})

class FakePostWrites implements PostWriteRepository {
  readonly edits: PostEditRecord[] = []
  readonly moves: PostVisibilityRecord[] = []
  post: Partial<PostEditTarget['post']> = {}
  forumId: number = SEED_FORUM.general

  async findEditTarget(threadId: number, postId: number): Promise<PostEditTarget | null> {
    if (threadId !== 20 || postId !== 50) return null
    return {
      post: {
        id: 50,
        threadId: 20,
        forumId: this.forumId,
        authorUserId: 1,
        subject: null,
        message: 'the original body',
        visibility: 'visible',
        isFirstPost: false,
        revisionCount: 0,
        createdAt: new Date('2026-07-30T11:00:00Z'),
        ...this.post,
      },
      thread: { id: 20, slug: 'hello', title: 'Hello', isLocked: false, visibility: 'visible' },
      forum: { id: this.forumId, slug: 'general', isOpen: true },
    }
  }

  async applyEdit(record: PostEditRecord): Promise<void> {
    this.edits.push(record)
  }

  async applyVisibility(record: PostVisibilityRecord): Promise<boolean> {
    this.moves.push(record)
    return true
  }
}

describe('post actions', () => {
  let postWrites: FakePostWrites

  beforeEach(() => {
    postWrites = new FakePostWrites()
    installContainer({ postWrites })
  })

  const EDIT = { threadId: '20', postId: '50', message: 'a better body', reason: 'typo' }

  describe('editPostAction', () => {
    it('saves and returns to the post', async () => {
      expect(await redirectOf(editPostAction(EMPTY_STATE, form(EDIT)))).toBe(
        '/thread/20-hello?post=50',
      )
      expect(postWrites.edits[0]).toMatchObject({
        message: 'a better body',
        previousMessage: 'the original body',
        reason: 'typo',
        revision: 1,
      })
    })

    it('refuses to edit somebody else"s post', async () => {
      postWrites.post = { authorUserId: 99 }
      const state = await editPostAction(EMPTY_STATE, form(EDIT))

      expect(state.error).toMatch(/cannot edit/i)
      expect(postWrites.edits).toHaveLength(0)
    })

    it('refuses a guest', async () => {
      actorRef.current = await actorFor(SEED_GROUP.guest, null)
      const state = await editPostAction(EMPTY_STATE, form(EDIT))

      expect(state.error).toBeDefined()
      expect(postWrites.edits).toHaveLength(0)
    })

    it('does not find a post that is not in the given thread', async () => {
      const state = await editPostAction(
        EMPTY_STATE,
        form({ ...EDIT, threadId: '21' }),
      )
      expect(state.error).toMatch(/does not exist/i)
      expect(postWrites.edits).toHaveLength(0)
    })

    it('does not confirm that a post in a forum it cannot see exists', async () => {
      const hidden = 555
      postWrites.forumId = hidden
      installContainer(
        { postWrites },
        {
          ...SEED_BOARD,
          chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
          overrides: [
            ...SEED_BOARD.overrides,
            { forumId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
          ],
        },
      )

      const state = await editPostAction(EMPTY_STATE, form(EDIT))

      expect(state.error).toBe('That post does not exist.')
      expect(postWrites.edits).toHaveLength(0)
    })

    it('keeps what was typed when the domain refuses', async () => {
      const state = await editPostAction(EMPTY_STATE, form({ ...EDIT, message: '' }))

      expect(state.error).toBeDefined()
      expect(state.values).toMatchObject({ reason: 'typo' })
      expect(postWrites.edits).toHaveLength(0)
    })

    it('renders a preview through the board renderer and writes nothing', async () => {
      const state = await editPostAction(
        EMPTY_STATE,
        form({ ...EDIT, message: 'a **bold** draft', intent: 'preview' }),
      )

      expect(state.preview).toBe('<p>a <strong>bold</strong> draft</p>')
      expect(postWrites.edits).toHaveLength(0)
    })

    it('leaves no notice when the author edits straight after posting', async () => {
      postWrites.post = { createdAt: new Date() }

      await redirectOf(editPostAction(EMPTY_STATE, form(EDIT)))

      expect(postWrites.edits[0]).toMatchObject({ silent: true, reason: 'typo' })
    })

    it('leaves the notice on an edit made long after posting', async () => {
      await redirectOf(editPostAction(EMPTY_STATE, form(EDIT)))

      expect(postWrites.edits[0]).toMatchObject({ silent: false })
    })

    it('never hides a moderator editing somebody else"s post', async () => {
      actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
      postWrites.post = { authorUserId: 1, createdAt: new Date() }

      await redirectOf(editPostAction(EMPTY_STATE, form(EDIT)))

      expect(postWrites.edits[0]).toMatchObject({ silent: false, editedByUserId: 2 })
    })

    it('reports an unchanged body without writing a revision', async () => {
      expect(
        await redirectOf(
          editPostAction(EMPTY_STATE, form({ ...EDIT, message: 'the original body' })),
        ),
      ).toBe('/thread/20-hello?post=50')
      expect(postWrites.edits).toHaveLength(0)
    })
  })

  describe('deletePostAction', () => {
    it('deletes and says so at the top of the thread', async () => {
      expect(
        await redirectOf(deletePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))),
      ).toBe('/thread/20-hello?removed=post')
      expect(postWrites.moves[0]).toMatchObject({ from: 'visible', to: 'deleted' })
    })

    it('refuses somebody else"s post without the soft-delete right', async () => {
      postWrites.post = { authorUserId: 99 }
      const state = await deletePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))

      expect(state.error).toMatch(/cannot delete/i)
      expect(postWrites.moves).toHaveLength(0)
    })

    it('lets a super moderator delete a post that is not theirs', async () => {
      postWrites.post = { authorUserId: 99 }
      actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)

      expect(
        await redirectOf(deletePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))),
      ).toBe('/thread/20-hello?removed=post')
    })

    it('refuses the opening post and says what to do instead', async () => {
      postWrites.post = { isFirstPost: true }
      const state = await deletePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))

      expect(state.error).toMatch(/first post/i)
      expect(postWrites.moves).toHaveLength(0)
    })
  })

  describe('restorePostAction', () => {
    beforeEach(() => {
      postWrites.post = { visibility: 'deleted' }
    })

    it('refuses the post"s own author', async () => {
      const state = await restorePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))

      expect(state.error).toMatch(/cannot restore/i)
      expect(postWrites.moves).toHaveLength(0)
    })

    it('lets a super moderator put it back, anchored to the post', async () => {
      actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)

      expect(
        await redirectOf(restorePostAction(EMPTY_STATE, form({ threadId: '20', postId: '50' }))),
      ).toBe('/thread/20-hello?post=50')
      expect(postWrites.moves[0]).toMatchObject({ from: 'deleted', to: 'visible' })
    })
  })
})
