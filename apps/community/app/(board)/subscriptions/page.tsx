import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SubscriptionService } from '@meith/subscriptions'
import { TextLink } from '@meith/ui'

import { SubscriptionRowForm } from '@/components/account/subscription-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { activeWordFilter } from '@/server/content-admin'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { followFormCopy } from '@/view/account-copy'
import { splitAround } from '@/view/copy'
import {
  buildSubscriptionsView,
  type SubscriptionRowView,
  subscriptionNotice,
} from '@/view/subscriptions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.subscriptions') }
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ followed?: string; stopped?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { subscriptions, authorizer } = getContainer()

  if (actor.userId === null || subscriptions === null) notFound()

  const visibleForumIds = await authorizer.visibleForumIds(actor)
  const rows = await new SubscriptionService({ subscriptions }).list(actor.userId, visibleForumIds)

  const translator = await getTranslator()

  const view = buildSubscriptionsView({
    rows,
    now: new Date(),
    t: translator,
    wordFilter: await activeWordFilter(),
  })
  const notice = subscriptionNotice(query)

  return (
    <PanelPage
      title={await tr('page.subscriptions')}
      lede={
        <>
          What you follow, and how often you hear about it.{' '}
          <TextLink href="/notifications/preferences">
            {await tr('page.whether-any-it-also-arrives')}
          </TextLink>{' '}
          is a separate setting.
        </>
      }
    >
      {notice !== null && <BoardNotice kind="info" message={notice} dismissHref="/subscriptions" />}

      {view.total === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {await tr('page.subscriptions.none')}
        </p>
      ) : (
        <>
          <Section
            title={await tr('page.threads')}
            empty={await tr('page.subscriptions.noThreads')}
            rows={view.threads}
            modes={view.modes}
            since={splitAround(translator, 'page.subscriptions.since', 'time')}
            copy={followFormCopy(translator)}
          />
          <Section
            title={await tr('page.forums')}
            empty={await tr('page.subscriptions.noForums')}
            rows={view.forums}
            modes={view.modes}
            since={splitAround(translator, 'page.subscriptions.since', 'time')}
            copy={followFormCopy(translator)}
          />
        </>
      )}
    </PanelPage>
  )
}

function Section({
  title,
  empty,
  rows,
  modes,
  since,
  copy,
}: {
  title: string
  empty: string
  rows: readonly SubscriptionRowView[]
  modes: readonly { readonly value: string; readonly label: string }[]
  since: readonly [string, string]
  copy: Readonly<Record<string, string>>
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <TextLink href={row.href} size="sm">
                  {row.title}
                </TextLink>
                <span className="text-xs text-muted-foreground">
                  {since[0]}
                  <time dateTime={row.since.iso}>{row.since.label}</time>
                  {since[1]}
                  {row.pending === null ? null : ` · ${row.pending}`}
                </span>
              </div>

              <div className="mt-3">
                <SubscriptionRowForm
                  target={row.target}
                  targetId={row.targetId}
                  mode={row.mode}
                  modes={modes}
                  copy={copy}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
