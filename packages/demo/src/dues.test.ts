import { pluginData, resultRows, type Database } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { dues, DUES_DEMO_GROUP, DUES_DEMO_PLANS } from '@meith/plugin-dues'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DUES_PLUGIN_KEY } from './dues'
import { seedDemoBoard, type SeedSummary } from './seed'

let harness: TestDb
let db: Database
let summary: SeedSummary

const NOW = new Date('2026-08-10T09:00:00Z')

const PLUGIN = dues({ currency: 'eur', graceDays: 7 })

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  summary = await seedDemoBoard(db, NOW, { plugins: [PLUGIN] })
}, 120_000)

afterAll(async () => {
  await harness.close()
})

async function rows<T>(text: string): Promise<T[]> {
  return resultRows(await db.execute(sql.raw(text))) as T[]
}

async function count(table: string, where = 'true'): Promise<number> {
  const found = await rows<{ n: number }>(
    `select count(*)::int as n from ${table} where ${where}`,
  )
  return found[0]?.n ?? 0
}

describe('the dues shop on the demo board', () => {
  it('reports what it furnished', async () => {
    expect(summary.plugins).toEqual([DUES_PLUGIN_KEY])
    expect(await count('plugin_dues_plan')).toBe(4)
  })

  it('applies the plugin migrations the core migrator does not', async () => {
    expect(await count('plugin_migrations', `plugin_key = '${DUES_PLUGIN_KEY}'`)).toBe(
      (PLUGIN.migrations ?? []).length,
    )
  })

  it('sells into a group an administrator has opted in to plugin grants', async () => {
    const group = await rows<{ plugin_grantable: boolean; is_staff_group: boolean }>(
      `select plugin_grantable, is_staff_group from usergroups where key = '${DUES_DEMO_GROUP}'`,
    )
    expect(group[0]?.plugin_grantable).toBe(true)
    expect(group[0]?.is_staff_group).toBe(false)
  })

  it('keeps one plan off sale, with its holder still holding it', async () => {
    expect(await count('plugin_dues_plan', 'archived')).toBe(1)
    expect(
      await count(
        'plugin_dues_membership',
        `plan_key = '${DUES_DEMO_PLANS.founder}' and status = 'active'`,
      ),
    ).toBe(1)
  })

  it('has a membership in every state the desk can act on', async () => {
    const states = await rows<{ status: string; n: number }>(
      `select status, count(*)::int as n from plugin_dues_membership group by status`,
    )
    const byStatus = new Map(states.map((row) => [row.status, row.n]))

    expect(byStatus.get('active')).toBeGreaterThanOrEqual(4)
    expect(byStatus.get('grace')).toBe(1)
    expect(byStatus.get('closing')).toBe(1)
    expect(byStatus.get('revoked')).toBe(1)
  })

  it('puts every live membership in the group it bought', async () => {
    const live = await count(
      'plugin_dues_membership',
      `status in ('active', 'grace', 'closing')`,
    )
    const granted = await count(
      'user_group_memberships m join usergroups g on g.id = m.group_id',
      `g.key = '${DUES_DEMO_GROUP}' and m.granted_by_plugin = '${DUES_PLUGIN_KEY}'`,
    )
    expect(granted).toBe(live)
  })

  it('takes the group back from the member who was refunded', async () => {
    const refunded = await rows<{ user_id: number }>(
      `select user_id from plugin_dues_membership where status = 'revoked'`,
    )
    expect(refunded).toHaveLength(1)
    expect(
      await count('user_group_memberships', `user_id = ${refunded[0]!.user_id}`),
    ).toBe(0)
  })

  it('never grants a membership that has already expired', async () => {
    expect(
      await count(
        'user_group_memberships',
        `granted_by_plugin = '${DUES_PLUGIN_KEY}' ` +
          `and (expires_at is null or expires_at <= '${NOW.toISOString()}')`,
      ),
    ).toBe(0)
  })

  it('prices everything in euro, plans and ledger alike', async () => {
    expect(await count('plugin_dues_plan', `currency <> 'eur'`)).toBe(0)
    expect(await count('plugin_dues_order', `currency <> 'eur'`)).toBe(0)
    expect(await count('plugin_dues_ledger', `currency <> 'eur'`)).toBe(0)
  })

  it('writes a ledger that spans months, and one negative line for the refund', async () => {
    const months = await rows<{ n: number }>(
      `select count(distinct date_trunc('month', occurred_at))::int as n from plugin_dues_ledger`,
    )
    expect(months[0]?.n).toBeGreaterThanOrEqual(5)
    expect(await count('plugin_dues_ledger', 'amount_minor < 0')).toBe(1)
  })

  it('leaves every recorded Stripe event processed', async () => {
    expect(await count('plugin_dues_event')).toBeGreaterThan(10)
    expect(await count('plugin_dues_event', 'processed_at is null')).toBe(0)
  })

  it('flags nothing: a demo that opens on an error is a demo of an error', async () => {
    expect(await count('plugin_dues_membership', 'needs_attention is not null')).toBe(0)
    expect(await count('plugin_dues_order', 'needs_attention is not null')).toBe(0)
  })

  it('counts the comp code’s redemption, and keeps the disabled one', async () => {
    const comp = await rows<{ redeemed_count: number }>(
      `select redeemed_count from plugin_dues_code where percent_off = 100`,
    )
    expect(comp[0]?.redeemed_count).toBe(1)
    expect(await count('plugin_dues_code', 'disabled')).toBe(1)
  })

  it('dates the shop’s history behind the reset, not on it', async () => {
    expect(await count('plugin_dues_order', `created_at > timestamptz '${NOW.toISOString()}'`)).toBe(0)
    const oldest = await rows<{ at: Date | string }>(
      `select min(created_at) as at from plugin_dues_order`,
    )
    const days = (NOW.getTime() - new Date(oldest[0]!.at).getTime()) / 86_400_000
    expect(days).toBeGreaterThan(200)
  })

  it('leaves nothing for the reconcile task to chase', async () => {
    expect(await count('plugin_dues_order', `status in ('created', 'pending')`)).toBe(0)
  })

  it('gives one member a gift somebody else paid for', async () => {
    expect(
      await count('plugin_dues_order', 'buyer_user_id <> recipient_user_id'),
    ).toBe(1)
  })

  it('serves the plans page from the tables, not from the config', async () => {
    const data = pluginData(db, DUES_PLUGIN_KEY)
    const sellable = await data.query(
      `select plan_key from plugin_dues_plan where not archived and not hidden`,
    )
    expect(sellable.map((row) => String(row.plan_key)).sort()).toEqual(
      [DUES_DEMO_PLANS.lifetime, DUES_DEMO_PLANS.month, DUES_DEMO_PLANS.pass].sort(),
    )
  })
})
