import type { Metadata } from 'next'

import { AdminSettingsForm } from '@/components/admin/settings-form'
import { requireAdmin } from '@/server/admin'
import { assessMailReadiness } from '@/server/mail-health'
import { getSettings } from '@/server/settings'
import { buildAdminSettingsModel, settingsHref } from '@/view/admin-settings'

export const metadata: Metadata = { title: 'Board settings' }

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; advanced?: string }>
}) {
  await requireAdmin()

  const query = await searchParams
  const model = buildAdminSettingsModel({
    snapshot: await getSettings(),
    query: query.q,
    group: query.group,
    advanced: query.advanced === '1',
  })

  const mail =
    model.activeGroup === 'registration' ? await assessMailReadiness() : null

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

      { }
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
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
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
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Show advanced settings
            </a>
          </>
        )}
      </p>

      {mail?.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-serif text-lg font-semibold text-destructive">
            Nobody can finish registering
          </h2>
          <p className="text-sm">
            The activation method is{' '}
            <strong className="font-medium">{mail.activationMethod}</strong>, so a new
            account waits for a confirmation link — but <code>MAIL_DRIVER</code> is{' '}
            <code>log</code>, which writes messages to the server log and sends nothing.
            Every account created while this is true is stuck: it cannot sign in, and the
            link that would release it never arrives.
          </p>
          <p className="text-sm">
            Either set the activation method to <strong className="font-medium">none</strong>{' '}
            or <strong className="font-medium">admin</strong>, or configure a mail driver.
            The driver is an environment variable and takes a restart; see the Mail section
            of the operator handbook.
          </p>
        </section>
      )}

      <AdminSettingsForm groups={model.groups} />
    </div>
  )
}
