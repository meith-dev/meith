import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SubscriptionService } from '@meith/subscriptions'
import { requireSlot } from '@meith/theme-kit'

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
  const rows = await new SubscriptionService({ subscriptions }).list(
    actor.userId,
    visibleForumIds,
  )

  const view = buildSubscriptionsView({ rows, now: new Date() })
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = subscriptionNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind="info" message={notice} dismissHref="/subscriptions" />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What you follow, and how often you hear about it.{' '}
            <a href="/notifications/preferences" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Whether any of it also arrives by e-mail
            </a>{' '}
            is a separate setting.
          </p>
        </div>

        {view.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not following anything yet. Use the “Follow” control on a
            thread or a forum, or tick the box when you post.
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
      </div>
    </main>
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
                <a href={row.href} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
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
