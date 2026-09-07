import type { PluginData, PluginRuntimeContext } from '@meith/plugin-kit'

import type { Award, AwardDraft, DisplayAward } from './awards'
import { clearDisplay } from './display-cache'
import type { AwardRule, AwardRuleInput } from './rules'

type AwardRow = Award & Record<string, unknown>
export interface GrantRow extends AwardRow {
  readonly grant_id: number
  readonly user_id: number
  readonly rule_id: number | null
  readonly reason: string
  readonly granted_at: string | Date
}

export async function allAwards(
  data: PluginData,
  publicOnly = false,
): Promise<readonly DisplayAward[]> {
  return data.query<DisplayAward>(
    `select a.*, count(distinct g.user_id)::int as count
    from plugin_awards_award a left join plugin_awards_grant g on g.award_id = a.id
    where ($1 = false or (a.listed and a.archived_at is null))
    group by a.id order by a.display_order, a.id`,
    [publicOnly],
  )
}

export async function awardById(data: PluginData, id: number): Promise<AwardRow | null> {
  return data.one<AwardRow>(`select * from plugin_awards_award where id = $1`, [id])
}

export async function saveAward(
  data: PluginData,
  draft: AwardDraft,
  id: number | null,
): Promise<'saved' | 'missing' | 'multiple'> {
  const params = [
    draft.name,
    draft.description,
    draft.icon_kind,
    draft.icon,
    draft.display_order,
    draft.allow_multiple,
    draft.listed,
  ]
  const result = await data.tx(async (tx) => {
    if (id === null) {
      await tx.query(
        `insert into plugin_awards_award
        (name, description, icon_kind, icon, display_order, allow_multiple, listed)
        values ($1, $2, $3, $4, $5, $6, $7)`,
        params,
      )
    } else {
      if (
        (await tx.one(`select id from plugin_awards_award where id = $1 for update`, [id])) === null
      )
        return 'missing'
      if (
        !draft.allow_multiple &&
        (await tx.one(
          `select user_id from plugin_awards_grant
        where award_id = $1 group by user_id having count(*) > 1 limit 1`,
          [id],
        )) !== null
      )
        return 'multiple'
      await tx.query(
        `update plugin_awards_award set name = $1, description = $2,
        icon_kind = $3, icon = $4, display_order = $5, allow_multiple = $6, listed = $7,
        updated_at = now() where id = $8`,
        [...params, id],
      )
    }
    return 'saved'
  })
  clearDisplay()
  return result
}

export async function deleteAward(data: PluginData, id: number): Promise<boolean> {
  return data.tx(async (tx) => {
    await tx.one(`select id from plugin_awards_award where id = $1 for update`, [id])
    const row = await tx.one(
      `delete from plugin_awards_award where id = $1
      and not exists (select 1 from plugin_awards_grant where award_id = $1) returning id`,
      [id],
    )
    clearDisplay()
    return row !== null
  })
}

export async function archiveAward(data: PluginData, id: number, archived: boolean): Promise<void> {
  await data.query(
    `update plugin_awards_award set archived_at = case when $2 then now() else null end, updated_at = now() where id = $1`,
    [id, archived],
  )
  clearDisplay()
}

export async function grantAward(
  context: PluginRuntimeContext,
  input: {
    awardId: number
    userId: number
    byUserId: number | null
    reason: string
    ruleId?: number
  },
): Promise<number | null> {
  const row = await context.data.tx(async (tx) => {
    const award = await tx.one<AwardRow>(
      `select * from plugin_awards_award where id = $1 for update`,
      [input.awardId],
    )
    if (award === null || award.archived_at !== null) return null
    return tx.one<{ id: number }>(
      `insert into plugin_awards_grant
      (award_id, user_id, granted_by_user_id, reason, rule_id)
      select $1, $2, $3, $4, $5 where $6 or not exists (
        select 1 from plugin_awards_grant where award_id = $1 and user_id = $2
      ) on conflict do nothing returning id`,
      [
        input.awardId,
        input.userId,
        input.byUserId,
        input.reason,
        input.ruleId ?? null,
        award.allow_multiple,
      ],
    )
  })
  if (row === null) return null
  clearDisplay(input.userId)
  if (context.settings.notify_on_grant !== false) {
    await context.notify.send({
      userId: input.userId,
      kind: 'award_received',
      subjectKey: 'awards.notification.subject',
      href: `/plugins/awards/member?id=${input.userId}`,
      dedupeKey: `grant:${row.id}`,
    })
  }
  return Number(row.id)
}

export async function revokeGrant(data: PluginData, id: number): Promise<void> {
  const row = await data.one<{ user_id: number }>(
    `delete from plugin_awards_grant where id = $1 returning user_id`,
    [id],
  )
  if (row !== null) clearDisplay(Number(row.user_id))
}

export async function memberGrants(data: PluginData, userId: number): Promise<readonly GrantRow[]> {
  return data.query<GrantRow>(
    `select a.*, g.id as grant_id, g.user_id, g.rule_id, g.reason, g.granted_at
    from plugin_awards_grant g join plugin_awards_award a on a.id = g.award_id
    where g.user_id = $1 and a.archived_at is null order by a.display_order, a.id, g.granted_at desc`,
    [userId],
  )
}

export async function recentGrants(
  data: PluginData,
  userId: number | null,
): Promise<readonly GrantRow[]> {
  return data.query<GrantRow>(
    `select a.*, g.id as grant_id, g.user_id, g.rule_id, g.reason, g.granted_at
    from plugin_awards_grant g join plugin_awards_award a on a.id = g.award_id
    where ($1::int is null or g.user_id = $1) order by g.granted_at desc, g.id desc limit 50`,
    [userId],
  )
}

export async function deleteMember(data: PluginData, userId: number): Promise<void> {
  await data.tx(async (tx) => {
    await tx.query(`delete from plugin_awards_grant where user_id = $1`, [userId])
    await tx.query(`delete from plugin_awards_dirty where user_id = $1`, [userId])
  })
  clearDisplay(userId)
}

export async function mergeMember(data: PluginData, kept: number, merged: number): Promise<void> {
  if (kept === merged) return
  await data.tx(async (tx) => {
    await tx.query(`select id from plugin_awards_award order by id for update`)
    await tx.query(
      `delete from plugin_awards_grant g using plugin_awards_grant other
      where g.user_id = $2 and other.user_id = $1 and g.rule_id = other.rule_id`,
      [kept, merged],
    )
    await tx.query(`update plugin_awards_grant set user_id = $1 where user_id = $2`, [kept, merged])
    await tx.query(
      `delete from plugin_awards_grant g using plugin_awards_award a
      where g.award_id = a.id and not a.allow_multiple and g.user_id = $1
      and exists (select 1 from plugin_awards_grant other
        where other.award_id = g.award_id and other.user_id = $1 and other.id < g.id)`,
      [kept],
    )
    await tx.query(`delete from plugin_awards_dirty where user_id = $1`, [merged])
    await tx.query(`insert into plugin_awards_dirty (user_id) values ($1) on conflict do nothing`, [
      kept,
    ])
  })
  clearDisplay(kept)
  clearDisplay(merged)
}

export async function awardRules(
  data: PluginData,
  enabledOnly = false,
): Promise<readonly AwardRule[]> {
  return data
    .query<AwardRule & Record<string, unknown>>(
      `select r.id, r.award_id as "awardId", r.title, r.enabled,
    r.min_post_count as "minPostCount", r.min_thread_count as "minThreadCount",
    r.min_reputation as "minReputation", r.min_days_registered as "minDaysRegistered"
    from plugin_awards_rule r join plugin_awards_award a on a.id = r.award_id
    where ($1 = false or (r.enabled and a.archived_at is null)) order by r.id`,
      [enabledOnly],
    )
    .then((rows) =>
      rows.map((row) => ({ ...row, id: Number(row.id), awardId: Number(row.awardId) })),
    )
}

export async function saveRule(
  data: PluginData,
  rule: AwardRuleInput,
  id: number | null,
): Promise<void> {
  const params = [
    rule.awardId,
    rule.title,
    rule.enabled,
    rule.minPostCount,
    rule.minThreadCount,
    rule.minReputation,
    rule.minDaysRegistered,
  ]
  if (id === null) {
    await data.query(
      `insert into plugin_awards_rule
      (award_id, title, enabled, min_post_count, min_thread_count, min_reputation, min_days_registered)
      values ($1, $2, $3, $4, $5, $6, $7)`,
      params,
    )
  } else {
    await data.query(
      `update plugin_awards_rule set award_id = $1, title = $2, enabled = $3,
      min_post_count = $4, min_thread_count = $5, min_reputation = $6, min_days_registered = $7,
      updated_at = now() where id = $8`,
      [...params, id],
    )
  }
}
