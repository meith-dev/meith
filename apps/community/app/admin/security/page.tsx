import type { Metadata } from 'next'

import { AUTH_EVENT_KINDS } from '@meith/accounts'

import { PANEL_LIST, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { boardSecurityActivity } from '@/server/auth-events'
import { getContainer } from '@/server/container'
import { getTranslator } from '@/server/i18n'
import { authEventLabel, describeAddress, describeDevice } from '@/view/security-activity'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Sign-in activity' }

const PAGE_SIZE = 50

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; kind?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const query = await searchParams
  const translator = await getTranslator()

  const kind = (AUTH_EVENT_KINDS as readonly string[]).includes(query.kind ?? '')
    ? (query.kind as (typeof AUTH_EVENT_KINDS)[number])
    : undefined

  const before = /^\d+$/.test(query.before ?? '') ? Number(query.before) : undefined

  const events = await boardSecurityActivity({
    limit: PAGE_SIZE + 1,
    ...(before === undefined ? {} : { before }),
    ...(kind === undefined ? {} : { kind }),
  })

  const page = events.slice(0, PAGE_SIZE)
  const more = events.length > PAGE_SIZE ? page[page.length - 1]?.id : undefined

  const names = await usernamesFor(page.map((event) => event.userId))
  const now = new Date()

  return (
    <PanelPage
      title="Sign-in activity"
      lede={
        <>
          Every authentication event on this board, newest first: who signed in, what was refused,
          and what members changed about how they get in. Separate from the admin log, which records
          what was done once somebody was already inside.
        </>
      }
      width="wide"
    >
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Kind</span>
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Everything</option>
            {AUTH_EVENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {authEventLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
        >
          Filter
        </button>
      </form>

      {page.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className={PANEL_LIST}>
          {page.map((event) => (
            <li key={event.id} className={PANEL_ROW}>
              <span className="flex flex-col text-sm">
                <span className="font-medium">{authEventLabel(event.kind)}</span>
                <span className="text-xs text-muted-foreground">
                  {event.userId === null
                    ? 'no account named'
                    : (names.get(event.userId) ?? `member ${event.userId}`)}{' '}
                  · {describeDevice(event.userAgent)} · {describeAddress(event.ipPrefix)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(event.at, now, translator).label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {more !== undefined && (
        <a
          href={`/admin/security?before=${more}${kind === undefined ? '' : `&kind=${kind}`}`}
          className="text-sm underline underline-offset-4"
        >
          Older activity
        </a>
      )}
    </PanelPage>
  )
}

async function usernamesFor(ids: readonly (number | null)[]): Promise<ReadonlyMap<number, string>> {
  const { accountStore } = getContainer()
  const wanted = [...new Set(ids.filter((id): id is number => id !== null))]

  const found = await Promise.all(wanted.map((id) => accountStore.accounts.findById(id)))

  return new Map(
    found.filter((account) => account !== null).map((account) => [account.id, account.username]),
  )
}
