import type { Metadata } from 'next'

import { buttonVariants, cn } from '@meith/ui'

import {
  PANEL_CARD,
  PANEL_LIST,
  PANEL_NOTE,
  PANEL_ROW,
  PanelActionLink,
} from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { parseUserFilter, USER_PAGE, userAdminRepository } from '@/server/user-admin'
import { readPage } from '@/view/pager'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.members') }
}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if ((await adminPageContext()) === null) return null

  const repository = userAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.members')} width="wide">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its members cannot be searched or
          edited.
        </p>
      </PanelPage>
    )
  }

  const params = await searchParams
  const filter = parseUserFilter(params)
  const [page, groups] = await Promise.all([repository.search(filter), repository.listGroups()])
  const now = new Date()
  const translator = await getTranslator()

  const value = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  return (
    <PanelPage
      title={await tr('page.members')}
      lede={
        <>
          Every criterion is combined, and every one is optional — an empty search is everybody. The
          filter is in the address bar, so this page can be bookmarked or handed to somebody else.
        </>
      }
      width="wide"
    >
      <nav className="flex flex-wrap gap-2">
        <PanelActionLink href="/admin/users/prune">
          {await tr('page.prune-dormant-accounts')}
        </PanelActionLink>
        <PanelActionLink href="/admin/users/mail">{await tr('page.mass-mail')}</PanelActionLink>
      </nav>

      <form method="get" className={PANEL_CARD}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="font-medium">{await tr('page.username-contains')}</span>
            <input name="username" defaultValue={value('username')} className={INPUT} />
          </label>

          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="font-medium">{await tr('page.email-contains')}</span>
            <input name="email" defaultValue={value('email')} className={INPUT} />
          </label>

          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="font-medium">{await tr('page.ip-starts-with')}</span>
            <input name="ip" defaultValue={value('ip')} className={INPUT} />
            <span className="text-xs text-muted-foreground">
              {await tr('page.only-prefix-ever-stored-so')}
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
              <option value="awaiting_activation">{await tr('page.awaiting-activation')}</option>
              <option value="banned">Banned</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{await tr('page.registered-before')}</span>
            <input type="date" name="before" defaultValue={value('before')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{await tr('page.registered-after')}</span>
            <input type="date" name="after" defaultValue={value('after')} className={INPUT} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{await tr('page.posts-at-least')}</span>
            <input
              type="number"
              name="minPosts"
              min={0}
              defaultValue={value('minPosts')}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{await tr('page.posts-at-most')}</span>
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
          <span>{await tr('page.include-deleted-accounts')}</span>
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
        <p className={PANEL_NOTE}>
          No members match. An empty result from a filled-in filter is a real answer — check the
          spelling before widening it.
        </p>
      ) : (
        <ul className={PANEL_LIST}>
          {page.rows.map((row) => (
            <li key={row.id} className={PANEL_ROW}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {row.username}
                  {row.isBanned ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">banned</span>
                  ) : (
                    row.state !== 'active' && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        awaiting activation
                      </span>
                    )
                  )}
                  {row.deletedAt !== null && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">deleted</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {row.email} · {row.primaryGroupTitle} · {row.postCount} post
                  {row.postCount === 1 ? '' : 's'}
                  {row.lastActiveAt === null
                    ? ' · never seen'
                    : ` · last seen ${formatTime(row.lastActiveAt, now, translator).label}`}
                </span>
              </span>
              <a
                href={`/admin/users/${row.id}`}
                aria-label={`Edit ${row.username}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                Edit
              </a>
            </li>
          ))}
        </ul>
      )}

      <PanelPagination
        path="/admin/users"
        params={params}
        page={readPage(params)}
        pageSize={USER_PAGE}
        total={page.total}
      />
    </PanelPage>
  )
}
