import type { Metadata } from 'next'

import { requireAdmin } from '@/server/admin'
import { formatTime } from '@/view/time'
import {
  nextPageQuery,
  parseUserFilter,
  userAdminRepository,
} from '@/server/user-admin'

export const metadata: Metadata = { title: 'Members' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const repository = userAdminRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Members</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its members cannot
          be searched or edited.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const filter = parseUserFilter(params)
  const [page, groups] = await Promise.all([
    repository.search(filter),
    repository.listGroups(),
  ])
  const now = new Date()

  const value = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          Every criterion is combined, and every one is optional — an empty
          search is everybody. The filter is in the address bar, so this page
          can be bookmarked or handed to somebody else.
        </p>
      </div>

      <nav className="flex flex-wrap gap-4 text-sm">
        <a href="/admin/users/prune" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Prune dormant accounts
        </a>
        <a href="/admin/users/mail" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Mass mail
        </a>
      </nav>

      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Username contains</span>
            <input name="username" defaultValue={value('username')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email contains</span>
            <input name="email" defaultValue={value('email')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">IP starts with</span>
            <input name="ip" defaultValue={value('ip')} className={INPUT} />
            <span className="text-xs text-muted-foreground">
              Only a prefix is ever stored, so this is a network.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Group</span>
            <select name="group" defaultValue={value('group')} className={INPUT}>
              <option value="">— any —</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">State</span>
            <select name="state" defaultValue={value('state')} className={INPUT}>
              <option value="">— any —</option>
              <option value="active">Active</option>
              <option value="awaiting_activation">Awaiting activation</option>
              <option value="banned">Banned</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Registered before</span>
            <input type="date" name="before" defaultValue={value('before')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Registered after</span>
            <input type="date" name="after" defaultValue={value('after')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Posts at least</span>
            <input type="number" name="minPosts" min={0} defaultValue={value('minPosts')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Posts at most</span>
            <input type="number" name="maxPosts" min={0} defaultValue={value('maxPosts')} className={INPUT} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="deleted"
            value="1"
            defaultChecked={value('deleted') !== ''}
            className="size-4"
          />
          <span>Include deleted accounts</span>
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
          <a
            href="/admin/users"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm"
          >
            Clear
          </a>
        </div>
      </form>

      {page.rows.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No members match. An empty result from a filled-in filter is a real
          answer — check the spelling before widening it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {page.rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {row.username}
                  {row.state !== 'active' && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {row.state === 'banned' ? 'banned' : 'awaiting activation'}
                    </span>
                  )}
                  {row.deletedAt !== null && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      deleted
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {row.email} · {row.primaryGroupTitle} · {row.postCount} post
                  {row.postCount === 1 ? '' : 's'}
                  {row.lastActiveAt === null
                    ? ' · never seen'
                    : ` · last seen ${formatTime(row.lastActiveAt, now).label}`}
                </span>
              </span>
              <a
                href={`/admin/users/${row.id}`}
                className="shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Edit
              </a>
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor !== null && (
        <a
          href={nextPageQuery(params, page.nextCursor)}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Next {50} members →
        </a>
      )}
    </div>
  )
}
