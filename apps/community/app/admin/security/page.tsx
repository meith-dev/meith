import type { Metadata } from 'next'

import { AUTH_EVENT_KINDS } from '@meith/accounts'

import { PANEL_LIST, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { boardSecurityActivity } from '@/server/auth-events'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { authEventLabel, describeAddress, describeDevice } from '@/view/security-activity'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.sign-in-activity') }
}

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
      title={await tr('page.sign-in-activity')}
      lede={translator.t('adminSecurity.lede')}
      width="wide"
    >
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{translator.t('adminSecurity.kind')}</span>
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{translator.t('adminSecurity.everything')}</option>
            {AUTH_EVENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {authEventLabel(value, translator)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
        >
          {translator.t('adminSecurity.filter')}
        </button>
      </form>

      {page.length === 0 ? (
        <p className="text-sm text-muted-foreground">{await tr('page.nothing-recorded-yet')}</p>
      ) : (
        <ul className={PANEL_LIST}>
          {page.map((event) => (
            <li key={event.id} className={PANEL_ROW}>
              <span className="flex flex-col text-sm">
                <span className="font-medium">{authEventLabel(event.kind, translator)}</span>
                <span className="text-xs text-muted-foreground">
                  {event.userId === null
                    ? translator.t('adminSecurity.noAccount')
                    : (names.get(event.userId) ??
                      translator.t('adminSecurity.member', { id: event.userId }))}{' '}
                  · {describeDevice(event.userAgent, translator)} ·{' '}
                  {describeAddress(event.ipPrefix)}
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
          {await tr('page.older-activity')}
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
