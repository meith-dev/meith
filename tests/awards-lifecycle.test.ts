import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

import { pluginData, pluginUsers } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { createTranslator } from '@meith/i18n'
import { type PluginRuntimeContext, unavailablePluginRuntime } from '@meith/plugin-kit'

import { displayAwards } from '../plugins/awards/src/display-cache'
import { handleRules } from '../plugins/awards/src/handlers'
import { AWARDS_MIGRATIONS } from '../plugins/awards/src/schema'
import {
  deleteAward,
  deleteMember,
  grantAward,
  memberGrants,
  mergeMember,
  revokeGrant,
  saveAward,
  saveRule,
} from '../plugins/awards/src/store'
import { evaluateAwards, queueMember } from '../plugins/awards/src/tasks'
import { memberList, PostbitBadges } from '../plugins/awards/src/ui/page'

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

it('evaluates real member standing, grants each rule once and wraps the scan', async () => {
  const awardId = await award(true)
  await saveRule(
    context.data,
    {
      awardId,
      title: 'Contributor',
      enabled: true,
      minPostCount: 10,
      minThreadCount: 2,
      minReputation: 5,
      minDaysRegistered: 30,
    },
    null,
  )
  await queueMember(context, alice)
  await queueMember(context, alice)
  expect(await context.data.query(`select * from plugin_awards_dirty`)).toHaveLength(1)
  await evaluateAwards(context)
  await evaluateAwards(context)
  expect(await memberGrants(context.data, alice)).toHaveLength(1)
  expect(await memberGrants(context.data, bob)).toHaveLength(1)
  expect(notified).toHaveLength(2)
  expect(
    await context.data.one(`select cursor, completed_at from plugin_awards_scan`),
  ).toMatchObject({ cursor: 0, completed_at: expect.anything() })
  await h.client.query(`update users set state = 'deleted' where id = $1`, [bob])
  const other = await award(true)
  await saveRule(
    context.data,
    {
      awardId: other,
      title: 'Everyone',
      enabled: true,
      minPostCount: 0,
      minThreadCount: null,
      minReputation: null,
      minDaysRegistered: null,
    },
    null,
  )
  await queueMember(context, bob)
  await evaluateAwards(context)
  expect(await memberGrants(context.data, bob)).toHaveLength(1)
  expect(await memberGrants(context.data, alice)).toHaveLength(2)
  expect(await context.data.query(`select * from plugin_awards_dirty`)).toEqual([])
})

it('renders capped awards with an exact remainder and hides reasons when configured', async () => {
  for (let i = 0; i < 4; i++) {
    await grantAward(context, {
      awardId: await award(),
      userId: alice,
      byUserId: bob,
      reason: 'Private thanks',
    })
  }
  const t = createTranslator({ locale: 'en', catalog: {} })
  const region = {
    region: 'postbit.badges' as const,
    authorId: alice,
    subjectId: 1,
    viewer: { userId: null, isGuest: true },
    locale: 'en',
    t,
    runtime: async () => ({ ...context, settings: { postbit_limit: 2 } }),
  }
  const node = await PostbitBadges(region)
  expect(node?.props.children[0]).toHaveLength(2)
  expect(node?.props.children[1]).toMatchObject({
    props: { href: `/plugins/awards/member?id=${alice}`, children: ['+', 2] },
  })
  expect(
    await PostbitBadges({
      ...region,
      runtime: async () => ({ ...context, settings: { postbit_limit: 0 } }),
    }),
  ).toBeNull()
  expect(JSON.stringify(await memberList({ ...context, t, locale: 'en' }, alice))).toContain(
    'Private thanks',
  )
  expect(
    JSON.stringify(
      await memberList({ ...context, settings: { show_reasons: false }, t, locale: 'en' }, alice),
    ),
  ).not.toContain('Private thanks')
})

it('supports rule administration and bounded run/reset notices', async () => {
  const awardId = await award()
  const request = (form: Record<string, string>) => ({
    form,
    viewer: { userId: alice, isGuest: false },
    method: 'POST',
    path: 'rules',
    query: {},
    headers: {},
    rawBody: null,
    json: null,
    boardUrl: 'https://board.test',
  })
  const form = { award_id: String(awardId), title: 'Welcome', enabled: 'on', min_post_count: '0' }
  expect(await handleRules(request({ ...form, min_post_count: '' }), context)).toMatchObject({
    to: expect.stringContaining('notice=rule-empty'),
  })
  expect(await handleRules(request(form), context)).toMatchObject({
    to: expect.stringContaining('notice=rule-saved'),
  })
  const id = String((await context.data.one(`select id from plugin_awards_rule`))!.id)
  await handleRules(request({ ...form, id, min_post_count: '20' }), context)
  await handleRules(request({ action: 'run' }), context)
  expect(notified).toHaveLength(0)
  await handleRules(request({ ...form, id }), context)
  await handleRules(request({ action: 'disable', id }), context)
  await evaluateAwards(context)
  expect(notified).toHaveLength(0)
  await handleRules(request({ action: 'enable', id }), context)
  expect(await handleRules(request({ action: 'run' }), context)).toMatchObject({
    to: expect.stringContaining('notice=evaluated'),
  })
  expect(notified).toHaveLength(2)
  expect(await handleRules(request({ action: 'reset' }), context)).toMatchObject({
    to: expect.stringContaining('notice=reset'),
  })
  await handleRules(request({ action: 'delete', id }), context)
  expect(await context.data.query(`select * from plugin_awards_rule`)).toEqual([])
  expect(await memberGrants(context.data, alice)).toHaveLength(1)
})
