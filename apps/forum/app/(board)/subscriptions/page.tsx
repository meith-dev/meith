import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SubscriptionService } from '@meith/subscriptions'
import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { SubscriptionRowForm } from '@/components/account/subscription-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import {
  buildSubscriptionsView,
  subscriptionNotice,
  type SubscriptionRowView,
} from '@/view/subscriptions'

export const metadata: Metadata = { title: 'Subscriptions' }

/**
 * F56 — everything a member follows.
 *
 * The screen F39's "subscribe to this thread" checkbox has needed since Phase 3:
 * the box has been writing rows for months and there has been nowhere to see
 * them, change them, or turn one off.
 *
 * **The list is filtered by what the member may still see.** A subscription to
 * a forum that has since been made private is dropped rather than shown greyed
 * out — a row that names a private forum back at somebody is a disclosure, and
 * the subscription itself keeps working the moment access returns.
 *
 * App-owned rather than a theme slot, like F55's centre and Phase 4's screens:
 * the slot registry is R6's list, frozen at F77, and this arrived after it.
 */
export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ followed?: string; stopped?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { subscriptions, authorizer } = getContainer()

  /*
   * A guest and a board with no subscription store get the same answer: this
   * page is not here. A member's follow list is theirs, and nothing about it
   * should be discoverable by asking for it.
   */
  if (actor.userId === null || subscriptions === null) notFound()

  /*
   * One resolution of the visible set, handed to the query — the same answer
   * the notifier resolves per member when it decides what to tell them, so the
   * screen and the e-mail cannot disagree about what this member follows.
   */
  const visibleForumIds = await authorizer.visibleForumIds(actor)
  const rows = await new SubscriptionService({ subscriptions }).list(
    actor.userId,
    visibleForumIds,
  )

  const view = buildSubscriptionsView({ rows, now: new Date() })
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = subscriptionNotice(query)

  return (
    <PanelPage
      title="Subscriptions"
      lede={
        <>
          What you follow, and how often you hear about it.{' '}
          <a
            href="/notifications/preferences"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Whether any of it also arrives by e-mail
          </a>{' '}
          is a separate setting.
        </>
      }
    >
      {notice !== null && (
        <Notice kind="info" message={notice} dismissHref="/subscriptions" />
      )}

      {view.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are not following anything yet. Use the “Follow” control on a thread or a
          forum, or tick the box when you post.
        </p>
      ) : (
        <>
          <Section
            title="Threads"
            empty="You are not following any threads."
            rows={view.threads}
            modes={view.modes}
          />
          <Section
            title="Forums"
            empty="You are not following any forums."
            rows={view.forums}
            modes={view.modes}
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
}: {
  title: string
  empty: string
  rows: readonly SubscriptionRowView[]
  modes: readonly { readonly value: string; readonly label: string }[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={row.href}
                  className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {row.title}
                </a>
                <span className="text-xs text-muted-foreground">
                  Following since <time dateTime={row.since.iso}>{row.since.label}</time>
                  {row.pending === null ? null : ` · ${row.pending}`}
                </span>
              </div>

              <div className="mt-3">
                <SubscriptionRowForm
                  target={row.target}
                  targetId={row.targetId}
                  mode={row.mode}
                  modes={modes}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
