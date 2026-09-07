import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

import { pluginData, pluginUsers } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { type PluginRuntimeContext, unavailablePluginRuntime } from '@meith/plugin-kit'

import { displayAwards } from '../plugins/awards/src/display-cache'
import { AWARDS_MIGRATIONS } from '../plugins/awards/src/schema'
import {
  deleteAward,
  deleteMember,
  grantAward,
  memberGrants,
  mergeMember,
  revokeGrant,
  saveAward,
} from '../plugins/awards/src/store'

let h: TestDb
let context: PluginRuntimeContext
let alice: number
let bob: number
let notified: unknown[]

beforeAll(async () => {
  h = await createTestDb()
  for (const migration of AWARDS_MIGRATIONS) await h.client.exec(migration.statements.join(';\n'))
})
afterAll(async () => {
  await h.close()
})
beforeEach(async () => {
  await h.client.exec(
    'delete from plugin_awards_grant; delete from plugin_awards_rule; delete from plugin_awards_award; delete from plugin_awards_dirty; update plugin_awards_scan set cursor = 0, completed_at = null; delete from users; delete from usergroups;',
  )
  await h.client.exec("insert into usergroups (key, title) values ('members', 'Members')")
  const result = await h.client.query<{
    id: number
  }>(`insert into users (username, username_lower, email, email_lower, primary_group_id, post_count, thread_count, reputation, created_at)
    select name, lower(name), lower(name) || '@example.test', lower(name) || '@example.test', (select id from usergroups limit 1), 10, 2, 5, now() - interval '100 days'
    from (values ('Alice'), ('Bob')) as names(name) returning id`)
  alice = result.rows[0]!.id
  bob = result.rows[1]!.id
  notified = []
  context = {
    ...unavailablePluginRuntime('test'),
    data: pluginData(h.db, 'awards'),
    users: pluginUsers(h.db),
    notify: {
      send: async (input) => {
        notified.push(input)
      },
    },
  }
})

async function award(multiple = false): Promise<number> {
  await saveAward(
    context.data,
    {
      name: 'Helpful',
      description: '',
      icon_kind: 'emoji',
      icon: '🏆',
      display_order: 0,
      allow_multiple: multiple,
      listed: true,
    },
    null,
  )
  return Number(
    (await context.data.one('select id from plugin_awards_award order by id desc limit 1'))!.id,
  )
}

it('grants a single-only award once, refuses deletion while held, and supports revoke', async () => {
  const awardId = await award()
  const input = { awardId, userId: alice, byUserId: bob, reason: 'Thank you' }
  const granted = await Promise.all([grantAward(context, input), grantAward(context, input)])
  expect(granted.filter((id) => id !== null)).toHaveLength(1)
  expect(notified).toHaveLength(1)
  expect(await displayAwards(context.data, alice, 6)).toMatchObject([
    { name: 'Helpful', count: 1, total: 1 },
  ])
  expect(await deleteAward(context.data, awardId)).toBe(false)
  expect((await memberGrants(context.data, alice))[0]?.reason).toBe('Thank you')
  await revokeGrant(context.data, granted.find((id) => id !== null)!)
  expect(await memberGrants(context.data, alice)).toEqual([])
  expect(await deleteAward(context.data, awardId)).toBe(true)
})

it('keeps multiple grants, collapses single-only and rule duplicates on merge, and deletes dirty rows', async () => {
  const single = await award()
  const multiple = await award(true)
  for (const userId of [alice, bob]) {
    for (const awardId of [single, multiple, multiple])
      await grantAward(context, { awardId, userId, byUserId: null, reason: '' })
    await grantAward(context, { awardId: multiple, userId, byUserId: null, reason: '', ruleId: 99 })
  }
  await mergeMember(context.data, alice, bob)
  const grants = await memberGrants(context.data, alice)
  expect(grants.filter((row) => Number(row.id) === single)).toHaveLength(1)
  expect(grants.filter((row) => Number(row.id) === multiple)).toHaveLength(5)
  expect(await memberGrants(context.data, bob)).toEqual([])
  expect(
    await context.data.one('select * from plugin_awards_dirty where user_id = $1', [alice]),
  ).not.toBeNull()
  await deleteMember(context.data, alice)
  expect(await memberGrants(context.data, alice)).toEqual([])
  expect(await context.data.query('select * from plugin_awards_dirty')).toEqual([])
})

it('keeps archived awards out of public display and rejects conversion while duplicates exist', async () => {
  const awardId = await award(true)
  const input = { awardId, userId: alice, byUserId: null, reason: '' }
  await grantAward(context, input)
  await grantAward(context, input)
  expect(
    await saveAward(
      context.data,
      {
        name: 'Helpful',
        description: '',
        icon_kind: 'emoji',
        icon: '🏆',
        display_order: 0,
        allow_multiple: false,
        listed: true,
      },
      awardId,
    ),
  ).toBe('multiple')
  await context.data.query(`update plugin_awards_award set archived_at = now() where id = $1`, [
    awardId,
  ])
  expect(await grantAward(context, input)).toBeNull()
  expect(await memberGrants(context.data, alice)).toEqual([])
})
