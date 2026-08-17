import type { Metadata } from 'next'

import { PANEL_LIST } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'
import { getTranslator } from '@/server/i18n'
import { ADMIN_LOG_PAGE_SIZE, buildAdminLogView } from '@/view/admin-log'
import { offsetOf, readPage } from '@/view/pager'

export const metadata: Metadata = { title: 'Admin log' }

export default async function AdminLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const query = await searchParams
  const { adminLog } = getContainer()
  if (adminLog === null) return null

  const translator = await getTranslator()
  const page = readPage(query)
  const filter = query.action === undefined ? {} : { action: query.action }

  const [rows, total, actions] = await Promise.all([
    adminLog.list({
      limit: ADMIN_LOG_PAGE_SIZE,
      offset: offsetOf(page, ADMIN_LOG_PAGE_SIZE),
      ...filter,
    }),
    adminLog.count(filter),
    adminLog.actions(),
  ])

  const view = buildAdminLogView({
    rows,
    actions,
    currentAction: query.action ?? '',
    now: new Date(),
    t: translator,
  })

  return (
    <PanelPage
      title="Admin log"
      lede={<>Every administrative and moderation action, newest first.</>}
      width="wide"
    >
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
        <ul className={PANEL_LIST}>
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

      <PanelPagination
        path="/admin/log"
        params={query}
        page={page}
        pageSize={ADMIN_LOG_PAGE_SIZE}
        total={total}
      />
    </PanelPage>
  )
}
