import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { activeTheme } from '@/server/theme'
import { USERCP_SECTIONS } from '@/view/usercp-nav'

export const metadata: Metadata = { title: 'Your control panel' }

/**
 * F57 — the panel's index.
 *
 * The screen two finished features have been missing a home for: F55's
 * notification preferences and F56's subscriptions both work on their own URLs
 * and are linked from the user panel, but nothing tied them together as "the
 * things you can change about your account".
 *
 * Neither is *moved* here. Both keep their URLs, because both are linked from
 * elsewhere — an e-mail footer points at the preferences screen — and a member
 * who bookmarked one should not find it gone. They render the panel's shell
 * instead, so the rail follows a member into their inbox.
 *
 * ## It used to be the navigation, and no longer has to be
 *
 * Nine full-width cards, one line each, stacked down a page: a thousand pixels
 * of scrolling to read nine short labels, and it was the *only* way between
 * screens, so changing an avatar and then a signature meant coming back here in
 * between. The rail does that job now, on every screen in the panel.
 *
 * So the index leads with **what is waiting** — unread messages, unread
 * notifications — exactly as the ACP's does, and for the same reason: nobody
 * opens their control panel to discover that an "Avatar" screen exists. When
 * both are clear it says so in one line rather than rendering two zeroes.
 *
 * The sections are still listed below it, because the rail's labels are terse
 * and this is where each one gets a sentence. Both read `USERCP_SECTIONS`, so
 * a screen cannot appear in one and not the other.
 *
 * ## Both counts are already paid for
 *
 * `PageShell` reads them for the user panel's badges on every page a signed-in
 * member loads. Reading them again here is the same two indexed counts, and
 * both swallow failure to zero — a dashboard is not worth a 500.
 */

/** One number that is also a call to action. */
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

  const Notice = requireSlot(activeTheme, 'Notice')

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
                {/*
                  The whole card is the target, through an overlay on the link
                  rather than an `<a>` wrapping both lines — so the link's
                  accessible name stays the section's title instead of the
                  title read together with its description. The ACP's index
                  does the same thing for the same reason.
                */}
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
