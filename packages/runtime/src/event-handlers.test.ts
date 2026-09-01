import { describe, expect, it } from 'vitest'

import type { DomainEventName } from '@meith/events'

import { buildEventRegistry, type WebhookFanout } from './event-handlers'

interface Sub {
  readonly id: number
  readonly topics: readonly string[]
  readonly format: 'json' | 'discord'
}

interface EnqueueCall {
  readonly webhookId: number
  readonly topic: string
  readonly deliveryId: string
  readonly payload: Record<string, unknown>
}

function counters() {
  return {
    rollUpAncestors: async () => true,
    applyVisibilityChange: async () => true,
  }
}

function fakeWebhooks(subs: readonly Sub[]): { impl: WebhookFanout; calls: EnqueueCall[] } {
  const calls: EnqueueCall[] = []
  let counter = 0
  const impl: WebhookFanout = {
    listActiveByTopic: async (topic) =>
      subs
        .filter((sub) => sub.topics.includes(topic))
        .map((sub) => ({ id: sub.id, format: sub.format })),
    enqueue: async (webhookId, topic, deliveryId, payload) => {
      calls.push({ webhookId, topic, deliveryId, payload })
      return true
    },
    boardUrl: async () => 'https://board.test',
    newDeliveryId: () => {
      counter += 1
      return `dlv_${counter}`
    },
  }
  return { impl, calls }
}

async function fire(
  registry: ReturnType<typeof buildEventRegistry>,
  event: DomainEventName,
  payload: unknown,
): Promise<void> {
  for (const id of registry.handlerIdsFor(event)) {
    await registry.dispatch(id, payload)
  }
}

describe('webhook fan-out', () => {
  it('enqueues one delivery per active subscription that carries the topic', async () => {
    const { impl, calls } = fakeWebhooks([
      { id: 1, topics: ['post.created'], format: 'json' },
      { id: 2, topics: ['post.created', 'thread.created'], format: 'json' },
    ])
    const registry = buildEventRegistry({ counters: counters(), webhooks: impl })

    await fire(registry, 'post.created', { postId: 40, threadId: 12, forumId: 3, authorId: 7 })

    expect(calls.map((c) => c.webhookId)).toEqual([1, 2])
    expect(new Set(calls.map((c) => c.deliveryId)).size).toBe(2)
    for (const call of calls) expect(call.topic).toBe('post.created')
  })

  it('skips a topic no subscription carries', async () => {
    const { impl, calls } = fakeWebhooks([{ id: 1, topics: ['post.created'], format: 'json' }])
    const registry = buildEventRegistry({ counters: counters(), webhooks: impl })

    await fire(registry, 'user.registered', {
      userId: 9,
      email: 'a@b.test',
      requiresActivation: false,
    })

    expect(calls).toHaveLength(0)
  })

  it('formats each subscription in its own format', async () => {
    const { impl, calls } = fakeWebhooks([
      { id: 1, topics: ['thread.created'], format: 'json' },
      { id: 2, topics: ['thread.created'], format: 'discord' },
    ])
    const registry = buildEventRegistry({ counters: counters(), webhooks: impl })

    await fire(registry, 'thread.created', { threadId: 12, forumId: 3, authorId: 7 })

    const json = calls.find((c) => c.webhookId === 1)!
    const discord = calls.find((c) => c.webhookId === 2)!
    expect(json.payload).toMatchObject({ event: 'thread.created', threadId: 12, forumId: 3 })
    expect(discord.payload).toEqual({ content: 'https://board.test/threads/12' })
  })

  it('carries report ids without rows', async () => {
    const { impl, calls } = fakeWebhooks([{ id: 5, topics: ['report.created'], format: 'json' }])
    const registry = buildEventRegistry({ counters: counters(), webhooks: impl })

    await fire(registry, 'report.created', {
      reportId: 88,
      targetKind: 'post',
      targetId: 40,
      reporterId: 7,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.payload).toMatchObject({
      event: 'report.created',
      reportId: 88,
      targetKind: 'post',
      targetId: 40,
      reporterId: 7,
    })
  })

  it('carries a private-message report with the real target kind', async () => {
    const { impl, calls } = fakeWebhooks([{ id: 6, topics: ['report.created'], format: 'json' }])
    const registry = buildEventRegistry({ counters: counters(), webhooks: impl })

    await fire(registry, 'report.created', {
      reportId: 91,
      targetKind: 'private_message',
      targetId: 12,
      reporterId: null,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.payload).toMatchObject({
      event: 'report.created',
      targetKind: 'private_message',
      targetId: 12,
      reporterId: null,
    })
  })

  it('registers no webhook handlers when no fan-out is wired', async () => {
    const registry = buildEventRegistry({ counters: counters() })
    expect(registry.ids().some((id) => id.startsWith('webhooks.'))).toBe(false)
  })
})
