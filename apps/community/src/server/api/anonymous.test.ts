import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryStore } from '@meith/accounts'
import type { Actor } from '@meith/authorization'

import { FixtureActorSource } from '../fixture-actor-source'
import { SEED_FORUM, SEED_FORUM_ROWS, SEED_GROUP } from '../seed-board'
import { installTestContainer } from '../test-container'
import type { ApiResult } from './http'
import { handlerFor } from './registry'

const PRIVATE = SEED_FORUM.generalOffTopic

const THREAD = {
  id: 4242,
  forumId: PRIVATE,
  title: 'Behind the curtain',
  slug: 'behind-the-curtain',
  authorUserId: 9,
  authorUsername: 'alice',
  replyCount: 0,
  viewCount: 0,
  isSticky: false,
  isLocked: false,
  visibility: 'visible',
  lastPostAt: new Date('2026-03-12T09:14:00.000Z'),
}

function containerWith(): void {
  installTestContainer({
    overrides: [{ forumId: PRIVATE, groupId: SEED_GROUP.guest, overrides: { canView: false } }],
    container: {
      forums: {
        listAll: async () => SEED_FORUM_ROWS,
        listListing: async () => SEED_FORUM_ROWS,
        findById: async (id: number) => SEED_FORUM_ROWS.find((row) => row.id === id) ?? null,
      },
      threads: {
        locate: async (id: number) =>
          id === THREAD.id ? { forumId: THREAD.forumId, authorUserId: THREAD.authorUserId } : null,
        findById: async () => THREAD,
        listForum: async () => ({ rows: [], nextCursor: null }),
      },
    },
  })
}

async function guest(): Promise<Actor> {
  return new FixtureActorSource(createMemoryStore()).buildGuest()
}

async function call(
  key: Parameters<typeof handlerFor>[0],
  params: Record<string, string> = {},
): Promise<ApiResult> {
  const handler = handlerFor(key)
  if (handler === null) throw new Error(`no handler for ${key}`)

  return handler({
    actor: await guest(),
    token: null,
    params,
    url: new URL('https://board.example/api/v1'),
    body: null,
  })
}

beforeEach(() => {
  containerWith()
})

describe('an anonymous caller', () => {
  it('sees the forums the guest group may view', async () => {
    const result = await call('GET /forums')
    const ids = (result.body as { data: readonly { id: number }[] }).data.map((row) => row.id)

    expect(ids).toContain(SEED_FORUM.general)
  })

  it('does not see a forum closed to guests, and is not told it exists', async () => {
    const result = await call('GET /forums')
    const ids = (result.body as { data: readonly { id: number }[] }).data.map((row) => row.id)

    expect(ids).not.toContain(PRIVATE)
  })

  it('cannot read a thread in a forum closed to guests', async () => {
    const result = await call('GET /threads/:threadId', { threadId: String(THREAD.id) })

    expect(result.status).toBe(404)
  })

  it('cannot list the posts of a thread in a forum closed to guests', async () => {
    const result = await call('GET /threads/:threadId/posts', { threadId: String(THREAD.id) })

    expect(result.status).toBe(404)
  })

  it('cannot list that forum’s threads', async () => {
    const result = await call('GET /forums/:forumId/threads', { forumId: String(PRIVATE) })

    expect(result.status).toBe(404)
  })

  it('is refused by every write, because a guest has no user id to write as', async () => {
    await expect(
      call('POST /forums/:forumId/threads', { forumId: String(SEED_FORUM.general) }),
    ).rejects.toThrow()

    await expect(call('GET /subscriptions')).rejects.toThrow()
  })
})
