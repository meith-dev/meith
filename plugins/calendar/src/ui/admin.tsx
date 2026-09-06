import type { PluginAdminPageContext } from '@meith/plugin-kit'
import { buttonVariants, controlVariants, surfaceVariants } from '@meith/ui'

import en from '../messages/en.json'
import { organiserIds } from '../store'

function translated(context: PluginAdminPageContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}

export async function OrganisersPage(context: PluginAdminPageContext) {
  const ids = await organiserIds(context.data).catch(() => [] as readonly number[])

  const named = await Promise.all(
    ids.map(async (userId) => ({
      userId,
      username: (await context.users.byId(userId).catch(() => null))?.username ?? String(userId),
    })),
  )

  return (
    <div className={surfaceVariants({ padded: true, className: 'text-sm' })}>
      {named.length === 0 ? (
        <p className="text-muted-foreground">
          {translated(context, 'calendar.admin.organisers.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {named.map((organiser) => (
            <li key={organiser.userId} className="flex items-center justify-between gap-3">
              <span>{organiser.username}</span>
              <form method="post" action="/admin/api/plugins/calendar/organisers/remove">
                <input type="hidden" name="user_id" value={organiser.userId} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: 'destructive', size: 'sm' })}
                >
                  {translated(context, 'calendar.admin.organisers.remove')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        method="post"
        action="/admin/api/plugins/calendar/organisers/add"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          {translated(context, 'calendar.admin.organisers.username')}
          <input name="username" required className={controlVariants()} />
        </label>
        <button type="submit" className={buttonVariants({ variant: 'primary' })}>
          {translated(context, 'calendar.admin.organisers.add')}
        </button>
      </form>
    </div>
  )
}
