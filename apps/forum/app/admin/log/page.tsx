import type { Metadata } from 'next'

import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'
import { buildAdminLogView } from '@/view/admin-log'

/*
 * Every other screen in the panel names itself; this one inherited the
 * layout's "Control panel", which is what the back button and a row of tabs
 * end up showing.
 */
export const metadata: Metadata = { title: 'Admin log' }

/**
 * F63 — the admin log.
 *
 * `admin_log` has had *writers* since F48 — every moderation action records a
 * row — and until now the only reader was the ModCP's view, which is scoped to
 * the forums one moderator covers. This is the unscoped one: an administrator
 * reading the audit log is reading everything, which is the point of there
 * being one.
 *
 * The detail column is rendered as **text**, never as markup and never as a
 * link: it is arbitrary JSON captured by whoever wrote the row, including rows
 * written by a previous deploy, and an audit log that fails to open because one
 * row is odd is an audit log that is absent exactly when it is needed.
 */
export default async function AdminLogPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; action?: string }>
}) {
  /* Re-run, because a layout is not a security boundary (see the layout). */
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

      {/*
        A GET form, because filtering is a read. It works with scripting off:
        a native `<select>` and a submit button, no on-change handler.
      */}
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
