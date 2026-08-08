/**
 * F55 at the app layer — who a new post's mentions and quotes notify.
 *
 * The extractors are unit-tested in `@meith/markdown` and the wording in
 * `@meith/notifications`. What is proven here is the producer's policy: names
 * resolve through the account store, the recipient's own permissions decide
 * whether they may be told, the author never notifies themselves, an ignore
 * is honoured, and none of it can throw back into the posting path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import { quoteBlock } from '@meith/markdown'
import type { RaiseInput, RaiseResult } from '@meith/notifications'

const { notifyMentionsAndQuotes } = await import('./post-notifications')
const { installTestContainer, CONTAINER_KEY } = await import('./test-container')
const { SEED_BOARD, SEED_COMMUNITY, SEED_GROUP } = await import('./seed-board')

class FakeNotifications {
  readonly raised: RaiseInput[] = []
  async raise(input: RaiseInput): Promise<RaiseResult> {
    this.raised.push(input)
    return { notificationId: this.raised.length, coalesced: false, emailQueued: false }
  }
  async emailPreferencesFor(): Promise<ReadonlyMap<string, boolean>> {
    return new Map()
  }
}

let notifications: FakeNotifications
let users: Map<string, { id: number; username: string }>

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

function install(
  overrides: Record<string, unknown> = {},
  board = SEED_BOARD,
): void {
  installTestContainer({
    board,
    container: {
      notifications,
      accountStore: {
        accounts: {
          findByUsernameLower: async (lower: string) => users.get(lower) ?? null,
        },
      },
      actorSource: {
        buildForUser: async (id: number) => actorFor(SEED_GROUP.registered, id),
      },
      ...overrides,
    },
  })
}

function facts(over: Record<string, unknown> = {}) {
  return {
    postId: 99,
    threadId: 7,
    threadSlug: 'hello',
    threadTitle: 'Hello',
    communityId: SEED_COMMUNITY.general,
    authorUserId: 1,
    authorUsername: 'ada',
    message: 'nothing to see',
    visibility: 'visible' as const,
    ...over,
  }
}

beforeEach(() => {
  notifications = new FakeNotifications()
  users = new Map([
    ['ada', { id: 1, username: 'ada' }],
    ['bob', { id: 2, username: 'bob' }],
    ['carol', { id: 3, username: 'carol' }],
  ])
  install()
})

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTAINER_KEY]
})

describe('mentions', () => {
  it('notifies a mentioned member, deep-linked to the post', async () => {
    await notifyMentionsAndQuotes(facts({ message: 'ping @bob' }))

    expect(notifications.raised).toHaveLength(1)
    expect(notifications.raised[0]).toMatchObject({
      userId: 2,
      kind: 'post.mentioned',
      data: { byUsername: 'ada', threadTitle: 'Hello' },
      dedupeKey: 'post.mentioned:99',
      href: '/thread/7-hello?after=98#post-99',
      /* The registry default: a mention mails unless the member said not to. */
      email: true,
    })
  })

  it('resolves a name case-insensitively but never notifies the author about themselves', async () => {
    await notifyMentionsAndQuotes(facts({ message: '@Ada and @BOB' }))

    expect(notifications.raised.map((r) => r.userId)).toEqual([2])
  })

  it('treats a name nobody holds as the prose it is', async () => {
    await notifyMentionsAndQuotes(facts({ message: 'ask @nobody about it' }))
    expect(notifications.raised).toEqual([])
  })

  it('caps how many members one post may notify', async () => {
    for (let i = 1; i <= 12; i += 1) {
      users.set(`user${i}`, { id: 10 + i, username: `user${i}` })
    }
    const message = Array.from({ length: 12 }, (_, i) => `@user${i + 1}`).join(' ')

    await notifyMentionsAndQuotes(facts({ message }))

    expect(notifications.raised).toHaveLength(10)
  })
})

describe('quotes', () => {
  it('notifies the quoted author with the quote kind, off for e-mail by default', async () => {
    const message = `${quoteBlock({ author: 'bob', markdown: 'the original' })}\n\nwell said`

    await notifyMentionsAndQuotes(facts({ message }))

    expect(notifications.raised).toHaveLength(1)
    expect(notifications.raised[0]).toMatchObject({
      userId: 2,
      kind: 'post.quoted',
      dedupeKey: 'post.quoted:99',
      email: false,
    })
  })

  it('raises one notification when a post both quotes and mentions somebody', async () => {
    const message = `${quoteBlock({ author: 'bob', markdown: 'the original' })}\n\ngood point @bob`

    await notifyMentionsAndQuotes(facts({ message }))

    expect(notifications.raised).toHaveLength(1)
    expect(notifications.raised[0]!.kind).toBe('post.quoted')
  })
})

describe('what must never notify', () => {
  it('says nothing about a post held for moderation', async () => {
    await notifyMentionsAndQuotes(
      facts({ message: 'ping @bob', visibility: 'unapproved' }),
    )
    expect(notifications.raised).toEqual([])
  })

  it('never tells a member about a thread they may not see', async () => {
    /* A community that is real and invisible to registered members: the mention
       resolves, the recipient's own matrix refuses, and silence is the answer —
       the notification would otherwise leak the thread's title. */
    const hidden = 555
    install(
      {},
      {
        ...SEED_BOARD,
        chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
        overrides: [
          ...SEED_BOARD.overrides,
          { communityId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
        ],
      },
    )

    await notifyMentionsAndQuotes(facts({ message: 'ping @bob', communityId: hidden }))

    expect(notifications.raised).toEqual([])
  })

  it('honours an ignore list, and fails closed when it cannot be read', async () => {
    install({ relations: { ignores: async () => true } })
    await notifyMentionsAndQuotes(facts({ message: 'ping @bob' }))
    expect(notifications.raised).toEqual([])

    install({
      relations: {
        ignores: async () => {
          throw new Error('down')
        },
      },
    })
    await notifyMentionsAndQuotes(facts({ message: 'ping @bob' }))
    expect(notifications.raised).toEqual([])
  })

  it('swallows a failing notification store rather than failing the post', async () => {
    install({
      notifications: {
        raise: async () => {
          throw new Error('store down')
        },
        emailPreferencesFor: async () => new Map(),
      },
    })

    await expect(
      notifyMentionsAndQuotes(facts({ message: 'ping @bob' })),
    ).resolves.toBeUndefined()
  })

  it('does nothing on a board with no notification store', async () => {
    install({ notifications: null })
    await expect(
      notifyMentionsAndQuotes(facts({ message: 'ping @bob' })),
    ).resolves.toBeUndefined()
  })
})
