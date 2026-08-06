import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { USERCP_SECTIONS } from '@/view/usercp-nav'

export const metadata: Metadata = { title: 'Your control panel' }

function Waiting({
  count,
  one,
  many,
  href,
  action,
}: {
  count: number
  one: string
  many: string
  href: string
  action: string
}) {
  return (
    <div className="flex flex-1 items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{count}</p>
        <p className="text-sm text-muted-foreground">{count === 1 ? one : many}</p>
      </div>
      <a
        href={href}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {action}
      </a>
    </div>
  )
}

export default async function UserCpPage() {
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const Notice = requireSlot(await currentTheme(), 'Notice')

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Your control panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything about your account that you decide.
        </p>
      </div>

      <Notice
        kind="info"
        message="Your profile is public. Your options and e-mail address are not."
        dismissHref={null}
      />

      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="font-serif text-lg font-semibold">
          Waiting for you
        </h2>

        {messages === 0 && notifications === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Nothing unread. No new messages and no new notifications.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            {messages > 0 && (
              <Waiting
                count={messages}
                one="unread message"
                many="unread messages"
                href="/messages"
                action="Read"
              />
            )}
            {notifications > 0 && (
              <Waiting
                count={notifications}
                one="unread notification"
                many="unread notifications"
                href="/notifications"
                action="Open"
              />
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="sections-heading" className="flex flex-col gap-3">
        <h2 id="sections-heading" className="font-serif text-lg font-semibold">
          Sections
        </h2>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USERCP_SECTIONS.map((section) => (
            <li
              key={section.href}
              className="relative h-full rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <a
                href={section.href}
                className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                { }
                <span className="absolute inset-0" />
                {section.title}
              </a>
              <p className="mt-0.5 text-xs text-muted-foreground">{section.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
