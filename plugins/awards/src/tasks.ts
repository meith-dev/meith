import type { PluginRuntimeContext, PluginUserStanding } from '@meith/plugin-kit'

import { evaluateAwardRules } from './rules'
import { awardRules, grantAward } from './store'

export async function queueMember(context: PluginRuntimeContext, userId: number): Promise<void> {
  await context.data.query(
    `insert into plugin_awards_dirty (user_id) values ($1) on conflict do nothing`,
    [userId],
  )
}

export async function evaluateAwards(context: PluginRuntimeContext): Promise<void> {
  const rules = await awardRules(context.data, true)
  const now = new Date()
  const evaluate = async (members: readonly PluginUserStanding[]) => {
    for (const outcome of evaluateAwardRules(rules, members, now)) {
      await grantAward(context, { ...outcome, byUserId: null, reason: '' })
    }
  }

  for (let drained = 0; drained < 500; ) {
    const limit = Math.min(200, 500 - drained)
    const rows = await context.data.query<{ user_id: number }>(
      `delete from plugin_awards_dirty
      where user_id in (select user_id from plugin_awards_dirty order by queued_at, user_id limit $1 for update skip locked)
      returning user_id`,
      [limit],
    )
    const ids = rows.map((row) => Number(row.user_id))
    if (ids.length === 0) break
    try {
      await evaluate(await context.users.standing(ids))
    } catch (error) {
      await context.data.query(
        `insert into plugin_awards_dirty (user_id)
        select unnest($1::int[]) on conflict do nothing`,
        [ids],
      )
      throw error
    }
    drained += ids.length
    if (ids.length < limit) break
  }

  const state = await context.data.one<{ cursor: number }>(
    `select cursor from plugin_awards_scan where id = 1`,
  )
  let cursor = Number(state?.cursor ?? 0)
  for (let scanned = 0; scanned < 1000; ) {
    const members = await context.users.scan({ afterUserId: cursor, limit: 200 })
    await evaluate(members)
    const complete = members.length < 200
    const next = complete ? 0 : members[members.length - 1]!.userId
    const advanced = await context.data.one(
      `update plugin_awards_scan set cursor = $1,
      completed_at = case when $2 then now() else completed_at end
      where id = 1 and cursor = $3 returning cursor`,
      [next, complete, cursor],
    )
    if (advanced === null || complete) break
    cursor = next
    scanned += members.length
  }
}
