import type { Metadata } from 'next'

import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'
import { buildAdminLogView } from '@/view/admin-log'

export const metadata: Metadata = { title: 'Admin log' }

export default async function AdminLogPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; action?: string }>
}) {
  await requireAdmin()

  const query = await searchParams
  const { adminLog } = getContainer()
  if (adminLog === null) return null

  const before = Number(query.before)
  const view = buildAdminLogView({
    rows: await adminLog.list({
      limit: 51,
      ...(Number.isInteger(before) && before > 0 ? { before } : {}),
      ...(query.action === undefined ? {} : { action: query.action }),
    }),
    actions: await adminLog.actions(),
    currentAction: query.action ?? '',
    now: new Date(),
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold">Admin log</h1>
        <p className="text-sm text-muted-foreground">
          Every administrative and moderation action, newest first.
        </p>
      </div>

      { }
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Action</span>
          <select
            name="action"
            defaultValue={view.currentAction}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Everything</option>
            {view.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
        >
          Filter
        </button>
      </form>

      {view.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing logged.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {view.rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <code className="text-xs font-medium">{row.action}</code>
                <span>{row.actor}</span>
                {row.ipPrefix !== null && (
                  <span className="text-xs text-muted-foreground">from {row.ipPrefix}</span>
                )}
                <time dateTime={row.at.iso} className="ml-auto text-xs text-muted-foreground">
                  {row.at.label}
                </time>
              </div>
              {row.detail !== '' && (
                <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {row.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {view.nextHref !== null && (
        <a href={view.nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Older entries
        </a>
      )}
    </div>
  )
}
