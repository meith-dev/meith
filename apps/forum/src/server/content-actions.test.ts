/**
 * F39 at the app layer — the Server Action.
 *
 * The posting rules are unit-tested in `@forum/threads` and the SQL against
 * real Postgres. What is proven here is the adapter tier neither can see: that
 * the action re-authorises for itself, that it reads a native `FormData` submit
 * (which is exactly what a no-JS form sends), and that it redirects where it
 * claims to.
 *
 * The container is replaced wholesale rather than mocked piecemeal — it is a
 * value on `globalThis`, and installing one is the same seam the auth action
 * tests use when they drop it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  Authorizer,
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@forum/authorization'
import type { Actor } from '@forum/authorization'
import type {
  CreatedThread,
  ForumPostingTarget,
  NewThreadRecord,
  ThreadWriteRepository,
} from '@forum/threads'

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

const { createThreadAction } = await import('./content-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { FIXTURE_DATA_VERSION, SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import(
  './seed-board'
)

const CONTAINER_KEY = Symbol.for('@forum/forum.container')

class FakeWrites implements ThreadWriteRepository {
  readonly written: NewThreadRecord[] = []
  constructor(private readonly rules: Partial<ForumPostingTarget> = {}) {}

  async postingRules(forumId: number): Promise<ForumPostingTarget | null> {
    if (forumId === 4242) return null
    return {
      id: forumId,
      type: 'forum',
      slug: 'general',
      isOpen: true,
      allowThreads: true,
      requiresPrefix: false,
      moderateNewThreads: false,
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

/**
 * Install a container for this test.
 *
 * It has to satisfy `getContainer`'s shape guard — the check that replaces a
 * container left behind by a dev-server reload — or the real fixture container
 * is rebuilt over the top of this one and the test silently exercises that
 * instead. Hence the read repositories nothing here calls.
 */
function installContainer(
  overrides: Record<string, unknown> = {},
  board = SEED_BOARD,
): void {
  const source = new InMemoryAuthorizationSource(board)
  ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
    authorizer: new Authorizer(source, {}),
    threadWrites: writes,
    threads: { findVisibleById: async () => null, listForum: async () => ({ rows: [], nextCursor: null }) },
    posts: {
      findVisibleById: async () => null,
      listThread: async () => ({ rows: [], nextAfterId: null }),
    },
    readState: null,
    threadViews: null,
    memberProfiles: {
      findPublicById: async (id: number) =>
        id === 1 ? { id, username: 'ada', joinedAt: new Date(), postCount: 0 } : null,
    },
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    dataSource: 'fixture',
    ...overrides,
  }
}

/** A native form submit: strings only, and no field for an unchecked box. */
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

/** Run an action expected to redirect, and return where it went. */
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

    // An unticked checkbox sends no field at all — the reason this reads
    // presence rather than a value.
    await redirectOf(createThreadAction(EMPTY_STATE, form(VALID)))
    expect(writes.written[1]!.subscribe).toBe(false)
  })

  it('refuses a guest, however the form was submitted', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const state = await createThreadAction(EMPTY_STATE, form(VALID))

    // The action is a public endpoint: never rendering the form to a guest is
    // not the same as refusing one who posts to it directly.
    expect(state.error).toBeTruthy()
    expect(writes.written).toEqual([])
  })

  it('refuses a member who may read a forum but not post in it', async () => {
    // Announcements is readable by everyone and postable by staff only. This is
    // the case the guest test cannot cover: a real, logged-in author with a
    // valid draft, refused by the matrix alone.
    const state = await createThreadAction(
      EMPTY_STATE,
      form({ ...VALID, forumId: String(SEED_FORUM.announcements) }),
    )

    expect(state.error).toBeTruthy()
    expect(writes.written).toEqual([])
  })

  it('does not confirm that a forum it cannot see exists', async () => {
    // A forum that is real and invisible to this actor. The writer would
    // happily describe it; the visibility check comes first, and it answers
    // exactly as it would for a forum that is not there — the existence of a
    // hidden forum is not something to confirm.
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
    // A rejected submit must not cost someone their draft.
    expect(state.values?.message).toBe('With a message in it.')
    expect(writes.written).toEqual([])
  })

  it('sends a held thread to its forum rather than to a page that 404s', async () => {
    writes = new FakeWrites({ moderateNewThreads: true })
    installContainer()

    const to = await redirectOf(createThreadAction(EMPTY_STATE, form(VALID)))

    expect(to).toBe(`/forum/${SEED_FORUM.general}-general?posted=moderated`)
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
