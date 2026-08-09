import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { formatTime } from '@/view/time'
import { nextPageQuery, parseUserFilter, userAdminRepository } from '@/server/user-admin'

export const metadata: Metadata = { title: 'Members' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * F67 — member search.
 *
 * **The search form is a GET form**, so the filter is in the address bar. It
 * survives a reload, it can be pasted to another administrator, and it needs
 * neither JavaScript nor a Server Action — the browser does all of it. A POST
 * search would be none of those things, and this is a screen operators work
 * from for long stretches.
 *
 * Paging is keyset, on the same cursor the repository returns. The set being
 * paged is `users`, which this screen's own actions mutate — banning somebody
 * changes their state and therefore whether they still match — and an OFFSET
 * page over a set being changed skips exactly the rows just acted on.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const repository = userAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title="Members" width="wide">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its members cannot be
          searched or edited.
        </p>
      </PanelPage>
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
    <PanelPage
      title="Members"
      lede={
        <>
          Every criterion is combined, and every one is optional — an empty search is
          everybody. The filter is in the address bar, so this page can be bookmarked or
          handed to somebody else.
        </>
      }
      width="wide"
    >
      <nav className="flex flex-wrap gap-4 text-sm">
        <a
          href="/admin/users/prune"
          className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Prune dormant accounts
        </a>
        <a
          href="/admin/users/mail"
          className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Mass mail
        </a>
      </nav>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
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
            <input
              type="date"
              name="before"
              defaultValue={value('before')}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Registered after</span>
            <input
              type="date"
              name="after"
              defaultValue={value('after')}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Posts at least</span>
            <input
              type="number"
              name="minPosts"
              min={0}
              defaultValue={value('minPosts')}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Posts at most</span>
            <input
              type="number"
              name="maxPosts"
              min={0}
              defaultValue={value('maxPosts')}
              className={INPUT}
            />
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
          No members match. An empty result from a filled-in filter is a real answer —
          check the spelling before widening it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {page.rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {row.username}
                  {/*
                    `isBanned`, not the state column. A ban is a `bans` row and a
                    group move — F23 never writes `state`, deliberately — so this
                    marked nobody as banned on any board, on the screen an
                    operator opens to find out who is.
                  */}
                  {row.isBanned ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      banned
                    </span>
                  ) : (
                    row.state !== 'active' && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        awaiting activation
                      </span>
                    )
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
              {/*
                Named for the member it opens, not "Edit".

                Fifty rows produce fifty links, and a reader moving by link — a
                screen reader's link list, or anything that reads the page out of
                order — gets "Edit, Edit, Edit…" with no way to tell which
                account is which. The visible word stays short because the name
                is already on the row beside it; `aria-label` is what carries the
                rest (WCAG 2.4.4).
              */}
              <a
                href={`/admin/users/${row.id}`}
                aria-label={`Edit ${row.username}`}
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
    </PanelPage>
  )
}
