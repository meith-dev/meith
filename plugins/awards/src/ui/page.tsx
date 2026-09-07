import type {
  PluginPageContext,
  PluginRegionContext,
  PluginRuntimeContext,
} from '@meith/plugin-kit'
import { surfaceVariants, textLinkVariants } from '@meith/ui'

import { asId, postbitLimit } from '../awards'
import { cachedAwards } from '../display-cache'
import { allAwards, awardById, type GrantRow, memberGrants } from '../store'
import { date, icon, type TextContext, translated } from './shared'

export async function AwardsPage(context: PluginPageContext) {
  const awards = await allAwards(context.data, true)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {awards.length === 0 && <p>{translated(context, 'awards.empty')}</p>}
      {awards.map((award) => (
        <article
          key={award.id}
          className={surfaceVariants({ padded: true, className: 'flex flex-col gap-3' })}
        >
          <div className="flex items-center gap-3">
            {icon(award)}
            <h2 className="font-semibold">
              <a href={`/plugins/awards/award?id=${award.id}`} className={textLinkVariants()}>
                {award.name}
              </a>
            </h2>
          </div>
          <p className="whitespace-pre-wrap text-sm">{award.description}</p>
          <p className="text-sm text-muted-foreground">
            {translated(context, 'awards.holders')}: {award.count}
          </p>
          <p className="text-sm">{translated(context, 'awards.staff')}</p>
        </article>
      ))}
    </div>
  )
}

export async function AwardPage(context: PluginPageContext) {
  const id = asId(context.query.id)
  const award = id === null ? null : await awardById(context.data, id)
  if (award === null || award.archived_at !== null)
    return <p>{translated(context, 'awards.notice.missing')}</p>
  const page = Math.min(asId(context.query.page) ?? 1, 1_000_000)
  const holders = await context.data.query<{
    user_id: number
    count: number
    granted_at: string | Date
  }>(
    `select user_id, count(*)::int as count, max(granted_at) as granted_at
    from plugin_awards_grant where award_id = $1 group by user_id
    order by max(granted_at) desc, user_id limit 51 offset $2`,
    [id, (page - 1) * 50],
  )
  const visible = holders.slice(0, 50)
  const members = await context.users.standing(visible.map((holder) => Number(holder.user_id)))
  const names = new Map(members.map((member) => [member.userId, member.username]))
  return (
    <section className={surfaceVariants({ padded: true, className: 'flex flex-col gap-4' })}>
      <div className="flex items-center gap-3">
        {icon(award)}
        <h2 className="text-lg font-semibold">{award.name}</h2>
      </div>
      <p className="whitespace-pre-wrap">{award.description}</p>
      <h3 className="font-semibold">{translated(context, 'awards.holders')}</h3>
      <ul className="flex flex-col gap-2">
        {visible.map((holder) => (
          <li key={holder.user_id} className="flex flex-wrap gap-3">
            <a className={textLinkVariants()} href={`/plugins/awards/member?id=${holder.user_id}`}>
              {names.get(Number(holder.user_id)) ?? translated(context, 'awards.deletedMember')}
            </a>
            <span>×{holder.count}</span>
            <span>{date(context, holder.granted_at)}</span>
          </li>
        ))}
      </ul>
      <nav className="flex gap-4" aria-label={translated(context, 'awards.pagination')}>
        {page > 1 && (
          <a
            href={`/plugins/awards/award?id=${id}&page=${page - 1}`}
            className={textLinkVariants()}
          >
            {translated(context, 'awards.previous')}
          </a>
        )}
        {holders.length > 50 && (
          <a
            href={`/plugins/awards/award?id=${id}&page=${page + 1}`}
            className={textLinkVariants()}
          >
            {translated(context, 'awards.next')}
          </a>
        )}
      </nav>
    </section>
  )
}

export async function memberList(context: TextContext & PluginRuntimeContext, userId: number) {
  const grants = await memberGrants(context.data, userId)
  const grouped = new Map<number, GrantRow[]>()
  for (const grant of grants) {
    const items = grouped.get(Number(grant.id)) ?? []
    items.push(grant)
    grouped.set(Number(grant.id), items)
  }
  return (
    <ul className="flex flex-col gap-4">
      {[...grouped].map(([id, items]) => {
        const award = items[0]!
        return (
          <li key={id} className="flex gap-3">
            {icon(award)}
            <div>
              <a className={textLinkVariants()} href={`/plugins/awards/award?id=${id}`}>
                {award.name}
              </a>
              <span> ×{items.length}</span>
              <ul className="text-sm text-muted-foreground">
                {items.map((grant) => (
                  <li key={grant.grant_id}>
                    <time dateTime={new Date(grant.granted_at).toISOString()}>
                      {date(context, grant.granted_at)}
                    </time>
                    {context.settings.show_reasons !== false &&
                      grant.rule_id === null &&
                      grant.reason !== '' && <span> · {grant.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )
      })}
      {grants.length === 0 && <li>{translated(context, 'awards.member.empty')}</li>}
    </ul>
  )
}

export async function MemberPage(context: PluginPageContext) {
  const id = asId(context.query.id)
  const member = id === null ? undefined : (await context.users.standing([id]))[0]
  if (member === undefined) return <p>{translated(context, 'awards.notice.unknown')}</p>
  return (
    <section className={surfaceVariants({ padded: true, className: 'flex flex-col gap-4' })}>
      <h2 className="font-semibold">
        <a href={`/member/${member.userId}`} className={textLinkVariants()}>
          {member.username}
        </a>
      </h2>
      {await memberList(context, member.userId)}
    </section>
  )
}

export async function PostbitBadges(context: PluginRegionContext) {
  if (context.authorId === null) return null
  const runtime = await context.runtime()
  const limit = postbitLimit(runtime.settings)
  if (limit === 0) return null
  const awards = await cachedAwards(runtime.data, context.authorId, limit)
  const more = Number(awards[0]?.total ?? 0) - limit
  const href = `/plugins/awards/member?id=${context.authorId}`
  return (
    <span className="flex flex-wrap items-center gap-1">
      {awards.slice(0, limit).map((award) => (
        <a key={award.id} href={href} title={award.name} aria-label={award.name}>
          {icon(award)}
        </a>
      ))}
      {more > 0 && (
        <a href={href} title={translated(context, 'awards.more')}>
          +{more}
        </a>
      )}
    </span>
  )
}

export async function ProfilePanel(context: PluginRegionContext) {
  if (context.subjectId === null) return null
  const runtime = await context.runtime()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{translated(context, 'awards.title')}</h2>
      {await memberList({ ...runtime, t: context.t, locale: context.locale }, context.subjectId)}
    </section>
  )
}

export async function Dashboard(context: PluginRegionContext) {
  const { data } = await context.runtime()
  const row = await data.one<{ count: number }>(
    `select count(*)::int as count from plugin_awards_grant where granted_at >= now() - interval '7 days'`,
  )
  return (
    <p>
      <a href="/admin/plugins/awards/grant" className={textLinkVariants()}>
        {translated(context, 'awards.dashboard')}
      </a>
      : {row?.count ?? 0}
    </p>
  )
}
