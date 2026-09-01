import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresWebhookRepository } from './api-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresWebhookRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresWebhookRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from webhook_deliveries`)
  await db.execute(sql`delete from webhooks`)
})

describe('PostgresWebhookRepository subscriptions', () => {
  it('creates a subscription and lists it with its format and zero counts', async () => {
    const id = await repo.create({
      url: 'https://a.test/hook',
      secret: 'whsec_a',
      topics: ['post.created'],
      active: true,
      format: 'discord',
      createdBy: null,
    })

    const [row] = await repo.listAll()
    expect(row).toMatchObject({
      id,
      url: 'https://a.test/hook',
      topics: ['post.created'],
      active: true,
      format: 'discord',
      delivered: 0,
      pending: 0,
      dead: 0,
    })
  })

  it('lists only active subscriptions that carry the topic', async () => {
    const matching = await repo.create({
      url: 'https://match.test',
      secret: 'whsec_1',
      topics: ['post.created', 'thread.created'],
      active: true,
      format: 'json',
      createdBy: null,
    })
    await repo.create({
      url: 'https://paused.test',
      secret: 'whsec_2',
      topics: ['post.created'],
      active: false,
      format: 'json',
      createdBy: null,
    })
    await repo.create({
      url: 'https://other.test',
      secret: 'whsec_3',
      topics: ['thread.created'],
      active: true,
      format: 'json',
      createdBy: null,
    })

    const subs = await repo.listActiveByTopic('post.created')
    expect(subs).toEqual([{ id: matching, format: 'json' }])
  })

  it('defaults the format to json for a legacy row with no format set', async () => {
    const rows = resultRows<{ id: number; format: string }>(
      await db.execute(sql`
      insert into webhooks (url, secret, topics, active)
      values ('https://legacy.test', 'whsec_legacy', '["post.created"]'::jsonb, true)
      returning id, format
    `),
    )

    expect(rows[0]!.format).toBe('json')
    const subs = await repo.listActiveByTopic('post.created')
    expect(subs).toEqual([{ id: rows[0]!.id, format: 'json' }])
  })

  it('toggles active and removes a subscription', async () => {
    const id = await repo.create({
      url: 'https://t.test',
      secret: 'whsec_t',
      topics: ['post.created'],
      active: true,
      format: 'json',
      createdBy: null,
    })

    expect(await repo.setActive(id, false)).toBe(true)
    expect(await repo.listActiveByTopic('post.created')).toEqual([])

    expect(await repo.remove(id)).toBe(true)
    expect(await repo.listAll()).toEqual([])
    expect(await repo.remove(id)).toBe(false)
  })
})

describe('PostgresWebhookRepository deliveries', () => {
  it('enqueues one delivery per webhook and drains it, de-duplicating on delivery id', async () => {
    const id = await repo.create({
      url: 'https://drain.test/hook',
      secret: 'whsec_drain',
      topics: ['post.created'],
      active: true,
      format: 'json',
      createdBy: null,
    })

    expect(
      await repo.enqueue(id, 'post.created', 'dlv_1', { event: 'post.created', postId: 5 }),
    ).toBe(true)
    expect(
      await repo.enqueue(id, 'post.created', 'dlv_1', { event: 'post.created', postId: 5 }),
    ).toBe(false)

    const claimed = await repo.claimDue(new Date(), 10)
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({
      webhookId: id,
      deliveryId: 'dlv_1',
      topic: 'post.created',
      url: 'https://drain.test/hook',
      secret: 'whsec_drain',
      attempts: 1,
    })

    await repo.markDelivered(claimed[0]!.id, 200, new Date())

    const [summary] = await repo.listAll()
    expect(summary).toMatchObject({ delivered: 1, pending: 0, dead: 0 })

    const recent = await repo.recentDeliveries(id, 10)
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({
      deliveryId: 'dlv_1',
      status: 'delivered',
      lastStatusCode: 200,
    })
  })

  it('removes deliveries with the subscription', async () => {
    const id = await repo.create({
      url: 'https://cascade.test',
      secret: 'whsec_c',
      topics: ['post.created'],
      active: true,
      format: 'json',
      createdBy: null,
    })
    await repo.enqueue(id, 'post.created', 'dlv_x', { event: 'post.created' })

    await repo.remove(id)

    const rows = resultRows<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from webhook_deliveries`),
    )
    expect(Number(rows[0]!.n)).toBe(0)
  })
})
