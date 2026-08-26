import type { PluginAdminPageContext } from '@meith/plugin-kit'

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
    <div className="flex flex-col gap-4 text-sm">
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
                <button type="submit" className="rounded border px-2 py-0.5 text-xs">
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
        className="flex items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          {translated(context, 'calendar.admin.organisers.username')}
          <input name="username" required className="rounded border p-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          {translated(context, 'calendar.admin.organisers.add')}
        </button>
      </form>
    </div>
  )
}
