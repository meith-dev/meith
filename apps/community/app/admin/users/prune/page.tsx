import type { Metadata } from 'next'

import { PruneForm } from '@/components/admin/user-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { tr } from '@/server/i18n'
import { parsePruneCriteria, userBulkRepository } from '@/server/user-admin'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.prune-members') }
}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminPrunePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if ((await adminPageContext()) === null) return null

  const repository = userBulkRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.prune-members')}>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has no membership to sweep.
        </p>
      </PanelPage>
    )
  }

  const params = await searchParams
  const criteria = parsePruneCriteria(params)
  const preview = criteria === null ? null : await repository.prunePreview(criteria)

  const value = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  return (
    <PanelPage
      back={{ href: '/admin/users', label: 'All members' }}
      title={await tr('page.prune-members')}
      lede={
        <>
          Closes dormant accounts in batches. It will never touch anybody who has posted — including
          posts still held for approval or already removed — anybody in a staff group or any group
          carrying staff powers, any forum moderator, or a banned account. Those are exclusions
          rather than options, because closing one of them does damage a date filter cannot justify.
        </>
      }
    >
      <form method="get" className={PANEL_CARD}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Registered before</span>
          <input type="date" name="before" defaultValue={value('before')} className={INPUT} />
          <span className="text-xs text-muted-foreground">
            Required. Without it a prune matches everybody.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Not seen since</span>
          <input type="date" name="inactive" defaultValue={value('inactive')} className={INPUT} />
          <span className="text-xs text-muted-foreground">
            Members who have never been seen at all count as inactive.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="awaiting"
            value="1"
            defaultChecked={value('awaiting') !== ''}
            className="size-4"
          />
          <span>Only accounts still awaiting activation</span>
        </label>

        <div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Show me
          </button>
        </div>
      </form>

      {criteria === null ? (
        <p className={PANEL_NOTE}>Choose a registration date to see what a prune would reach.</p>
      ) : preview !== null && preview.total === 0 ? (
        <p className={PANEL_NOTE}>
          Nothing matches. Every account registered before that date has written something, is
          staff, moderates a forum, or is banned.
        </p>
      ) : preview !== null ? (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {preview.total} account{preview.total === 1 ? '' : 's'} would be closed
          </h2>

          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {preview.sample.map((row) => (
              <li key={row.id}>
                <a
                  href={`/admin/users/${row.id}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {row.username}
                </a>{' '}
                — {row.email}, registered {row.createdAt.toISOString().slice(0, 10)}
              </li>
            ))}
            {preview.total > preview.sample.length && (
              <li>…and {preview.total - preview.sample.length} more.</li>
            )}
          </ul>

          <PruneForm
            before={value('before')}
            inactive={value('inactive')}
            awaiting={value('awaiting') !== ''}
            total={preview.total}
          />
        </section>
      ) : null}
    </PanelPage>
  )
}
