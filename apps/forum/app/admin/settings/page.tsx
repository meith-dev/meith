import type { Metadata } from 'next'

import { AdminSettingsForm } from '@/components/admin/settings-form'
import { requireAdmin } from '@/server/admin'
import { getSettings } from '@/server/settings'
import { buildAdminSettingsModel, settingsHref } from '@/view/admin-settings'

export const metadata: Metadata = { title: 'Board settings' }

/**
 * F64 — board settings.
 *
 * Generated entirely from F08's registry: this file names no setting, and the
 * navigation, the search and every control come from `SETTING_DEFINITIONS`.
 *
 * The filters are **links, not a scripted filter**. A group tab and the search
 * box are GET forms, so the state is in the URL — which means an operator can
 * bookmark "the posting settings", send somebody a link to the one they are
 * arguing about, and use the back button. A client-side filter would have none
 * of that and would need JavaScript for a screen that otherwise does not.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; advanced?: string }>
}) {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const query = await searchParams
  const model = buildAdminSettingsModel({
    snapshot: await getSettings(),
    query: query.q,
    group: query.group,
    advanced: query.advanced === '1',
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Board settings</h1>
        <p className="text-sm text-muted-foreground">
          Every setting this build has, with what it does. A value equal to its
          default is not stored, so changing a default in a later release reaches
          a board that never touched it.
        </p>
      </div>

      {/* A GET form: the search term lands in the URL and is shareable. */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Search settings</span>
          <input
            type="search"
            name="q"
            defaultValue={model.query}
            placeholder="Search by name or description"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        {model.showAdvanced && <input type="hidden" name="advanced" value="1" />}
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium"
        >
          Search
        </button>
      </form>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Setting groups">
        {model.tabs.map((tab) => (
          <a
            key={tab.group}
            href={settingsHref({ group: tab.group, advanced: model.showAdvanced })}
            aria-current={model.activeGroup === tab.group ? 'page' : undefined}
            className={
              model.activeGroup === tab.group
                ? 'rounded-md bg-secondary px-3 py-1 font-medium'
                : 'rounded-md px-3 py-1 text-muted-foreground hover:text-foreground'
            }
          >
            {tab.label}
          </a>
        ))}
      </nav>

      <p className="text-xs text-muted-foreground">
        {model.query === ''
          ? null
          : `Searching every group for “${model.query}”. `}
        {model.showAdvanced ? (
          <a
            href={settingsHref({
              group: model.activeGroup,
              query: model.query,
              advanced: false,
            })}
            className="text-primary hover:underline"
          >
            Hide advanced settings
          </a>
        ) : (
          <>
            {model.hiddenAdvanced > 0 && (
              <>
                {model.hiddenAdvanced} advanced setting
                {model.hiddenAdvanced === 1 ? ' is' : 's are'} hidden.{' '}
              </>
            )}
            <a
              href={settingsHref({
                group: model.activeGroup,
                query: model.query,
                advanced: true,
              })}
              className="text-primary hover:underline"
            >
              Show advanced settings
            </a>
          </>
        )}
      </p>

      <AdminSettingsForm groups={model.groups} />
    </div>
  )
}
