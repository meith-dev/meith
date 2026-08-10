import { beforeEach, describe, expect, it } from 'vitest'

import { quoteBlock } from '@meith/markdown'
import type { RaiseInput, RaiseResult } from '@meith/notifications'

const { notifyPostAudience } = await import('./post-notifications')
const { installTestContainer } = await import('./test-container')

class FakeNotifications {
  readonly raised: RaiseInput[] = []
  failing = false

  async raise(input: RaiseInput): Promise<RaiseResult> {
    if (this.failing) throw new Error('notification store is down')
    this.raised.push(input)
    return { notificationId: this.raised.length, coalesced: false, emailQueued: false }
  }

  async emailPreferencesFor(): Promise<ReadonlyMap<string, boolean>> {
    return new Map()
  }
}

let notifications: FakeNotifications
let container: Record<string, unknown>

beforeEach(() => {
  notifications = new FakeNotifications()
  container = installTestContainer({ container: { notifications } })
})

async function member(username: string): Promise<number> {
  const store = container['accountStore'] as {
    accounts: {
      create(input: Record<string, unknown>): Promise<{ id: number }>
    }
  }
  const account = await store.accounts.create({
    username,
    usernameLower: username.toLowerCase(),
    email: `${username.toLowerCase()}@example.com`,
    emailLower: `${username.toLowerCase()}@example.com`,
    passwordHash: 'irrelevant',
    passwordAlgo: 'argon2id',
    state: 'active',
    primaryGroupId: 2,
  })
  return account.id
}

function notice(over: Partial<Parameters<typeof notifyPostAudience>[0]> = {}) {
  return {
    postId: 99,
    threadId: 7,
    threadSlug: 'hello',
    threadTitle: 'Hello',
    message: '',
    authorUsername: 'Poster',
    visibility: 'visible' as const,
    ...over,
  }
}

describe('notifyPostAudience', () => {
  it('tells a mentioned member, with the post permalink and captured facts', async () => {
    const wren = await member('wren')

    await notifyPostAudience(notice({ message: 'good point @wren' }))

    expect(notifications.raised).toHaveLength(1)
    expect(notifications.raised[0]).toMatchObject({
      userId: wren,
      kind: 'post.mentioned',
      href: '/thread/7-hello?post=99',
      data: { byUsername: 'Poster', threadTitle: 'Hello' },
      dedupeKey: 'post.mentioned:99',
    })
  })

  it('resolves a mention by folded name, the way login and PMs do', async () => {
    const ada = await member('Ada')
    await notifyPostAudience(notice({ message: 'over to @ADA' }))
    expect(notifications.raised.map((row) => row.userId)).toEqual([ada])
  })

  it('tells a quoted author, and only once when the reply also mentions them', async () => {
    const wren = await member('wren')
    const message = `${quoteBlock({ author: 'wren', markdown: 'hello' })}\n\nagreed, @wren`

    await notifyPostAudience(notice({ message }))

    expect(notifications.raised).toHaveLength(1)
    expect(notifications.raised[0]).toMatchObject({
      userId: wren,
      kind: 'post.quoted',
      dedupeKey: 'post.quoted:99',
    })
  })

  it('never tells the author about themself, however they arrive', async () => {
    await member('Poster')
    const message = `${quoteBlock({ author: 'Poster', markdown: 'as I said' })}\n\nstill true, @poster`
    await notifyPostAudience(notice({ message }))
    expect(notifications.raised).toHaveLength(0)
  })

  it('lets a name nobody holds pass silently', async () => {
    await notifyPostAudience(notice({ message: 'hi @nobody-here' }))
    expect(notifications.raised).toHaveLength(0)
  })

  it('tells nobody about a post the queue is still holding', async () => {
    await member('wren')
    await notifyPostAudience(notice({ message: '@wren look', visibility: 'unapproved' }))
    expect(notifications.raised).toHaveLength(0)
  })

  it('stops at the per-kind ceiling, in first-appearance order', async () => {
    const ids: number[] = []
    for (let i = 0; i < 12; i += 1) ids.push(await member(`member${i}`))
    const message = ids.map((_, i) => `@member${i}`).join(' ')

    await notifyPostAudience(notice({ message }))

    expect(notifications.raised).toHaveLength(10)
    expect(notifications.raised.map((row) => row.userId)).toEqual(ids.slice(0, 10))
  })

  it('swallows a failing store: the post exists, so this must not throw', async () => {
    await member('wren')
    notifications.failing = true
    await expect(
      notifyPostAudience(notice({ message: 'hi @wren' })),
    ).resolves.toBeUndefined()
  })
})
