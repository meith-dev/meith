import type { Metadata } from 'next'

import { PruneForm } from '@/components/admin/user-forms'
import { requireAdmin } from '@/server/admin'
import { parsePruneCriteria, userBulkRepository } from '@/server/user-admin'

export const metadata: Metadata = { title: 'Prune members' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminPrunePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const repository = userBulkRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Prune members</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has no
          membership to sweep.
        </p>
      </div>
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/users" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          ← All members
        </a>
        <h1 className="font-serif text-2xl font-semibold">Prune members</h1>
        <p className="text-sm text-muted-foreground">
          Closes dormant accounts in batches. It will never touch anybody who
          has posted, anybody in a staff group, any forum moderator, or a banned
          account — those are exclusions rather than options, because closing
          one of them does damage a date filter cannot justify.
        </p>
      </div>

      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border p-4">
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
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Choose a registration date to see what a prune would reach.
        </p>
      ) : preview !== null && preview.total === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing matches. Every account registered before that date has posted,
          is staff, moderates a forum, or is banned.
        </p>
      ) : preview !== null ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-serif text-lg font-semibold">
            {preview.total} account{preview.total === 1 ? '' : 's'} would be closed
          </h2>

          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {preview.sample.map((row) => (
              <li key={row.id}>
                <a href={`/admin/users/${row.id}`} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                  {row.username}
                </a>{' '}
                — {row.email}, registered{' '}
                {row.createdAt.toISOString().slice(0, 10)}
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
    </div>
  )
}
