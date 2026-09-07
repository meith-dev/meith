import type { PluginAdminPageContext } from '@meith/plugin-kit'
import { controlVariants, surfaceVariants, textLinkVariants } from '@meith/ui'

import { asId, ICON_PATHS } from '../awards'
import { allAwards, awardById, recentGrants } from '../store'
import { action, button, checkbox, date, field, icon, notice, translated } from './shared'

export async function AwardsAdmin(context: PluginAdminPageContext) {
  const awards = await allAwards(context.data)
  const editId = asId(context.query.edit)
  const edit = editId === null ? null : await awardById(context.data, editId)
  return (
    <div className="flex flex-col gap-4">
      {notice(context, context.query.notice)}
      <section className={surfaceVariants({ padded: true })}>
        <h2 className="mb-4 font-semibold">
          {translated(context, edit === null ? 'awards.create' : 'awards.edit')}
        </h2>
        <form
          method="post"
          action="/admin/api/plugins/awards/awards"
          className="grid gap-3 sm:grid-cols-2"
        >
          {edit !== null && <input type="hidden" name="id" value={edit.id} />}
          {field(context, 'name', 'awards.name', edit?.name ?? '', 'text', true)}
          {field(context, 'icon', 'awards.icon', edit?.icon ?? '🏆', 'text', true)}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {translated(context, 'awards.icon.help')} {Object.keys(ICON_PATHS).join(', ')}
          </p>
          <label className="flex flex-col gap-1 sm:col-span-2">
            {translated(context, 'awards.description')}
            <textarea
              name="description"
              maxLength={2000}
              defaultValue={edit?.description ?? ''}
              className={controlVariants()}
            />
          </label>
          {field(context, 'display_order', 'awards.order', edit?.display_order ?? 0, 'number')}
          {checkbox(context, 'allow_multiple', 'awards.multiple', edit?.allow_multiple ?? false)}
          {checkbox(context, 'listed', 'awards.listed', edit?.listed ?? true)}
          <div>{button(context, 'awards.save')}</div>
        </form>
      </section>
      <ul className="flex flex-col gap-3">
        {awards.map((award) => (
          <li
            key={award.id}
            className={surfaceVariants({
              padded: true,
              className: 'flex flex-wrap items-center gap-3',
            })}
          >
            {icon(award)}
            <a
              href={`/admin/plugins/awards/awards?edit=${award.id}`}
              className={textLinkVariants()}
            >
              {award.name}
            </a>
            <span>
              {translated(context, 'awards.order')}: {award.display_order}
            </span>
            <span>
              {translated(context, 'awards.holders')}: {award.count}
            </span>
            {action(
              context,
              'awards',
              award.id,
              award.archived_at === null ? 'archive' : 'restore',
              award.archived_at === null ? 'awards.archive' : 'awards.restore',
            )}
            {action(context, 'awards', award.id, 'delete', 'awards.delete')}
          </li>
        ))}
      </ul>
    </div>
  )
}

export async function GrantAdmin(context: PluginAdminPageContext) {
  const awards = (await allAwards(context.data)).filter((award) => award.archived_at === null)
  const filter = context.query.user?.trim() ?? ''
  const member = filter === '' ? null : await context.users.byUsername(filter)
  const grants =
    filter !== '' && member === null ? [] : await recentGrants(context.data, member?.userId ?? null)
  const users = await context.users.standing([
    ...new Set(grants.map((grant) => Number(grant.user_id))),
  ])
  const names = new Map(users.map((user) => [user.userId, user.username]))
  return (
    <div className="flex flex-col gap-4">
      {notice(context, context.query.notice)}
      <form
        method="post"
        action="/admin/api/plugins/awards/grant"
        className={surfaceVariants({ padded: true, className: 'grid gap-3 sm:grid-cols-2' })}
      >
        <label className="flex flex-col gap-1">
          {translated(context, 'awards.award')}
          <select name="award_id" required className={controlVariants()}>
            {awards.map((award) => (
              <option key={award.id} value={award.id}>
                {award.name}
              </option>
            ))}
          </select>
        </label>
        {field(context, 'usernames', 'awards.usernames', '', 'text', true)}
        <label className="flex flex-col gap-1">
          {translated(context, 'awards.reason')}
          <textarea name="reason" maxLength={2000} className={controlVariants()} />
        </label>
        <div>{button(context, 'awards.grant')}</div>
      </form>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {field(context, 'user', 'awards.filter', filter)}
        {button(context, 'awards.filter.apply')}
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="text-left font-semibold">
            {translated(context, 'awards.recent')}
          </caption>
          <thead>
            <tr>
              {(
                [
                  'awards.member',
                  'awards.award',
                  'awards.reason',
                  'awards.date',
                  'awards.actions',
                ] as const
              ).map((key) => (
                <th key={key} className="p-2">
                  {translated(context, key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={grant.grant_id} className="border-t">
                <td className="p-2">
                  <a href={`/plugins/awards/member?id=${grant.user_id}`}>
                    {names.get(Number(grant.user_id)) ??
                      translated(context, 'awards.deletedMember')}
                  </a>
                </td>
                <td className="p-2">{grant.name}</td>
                <td className="p-2">{grant.reason}</td>
                <td className="p-2">{date(context, grant.granted_at)}</td>
                <td className="p-2">
                  {action(context, 'grant', grant.grant_id, 'revoke', 'awards.revoke')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
