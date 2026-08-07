import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { PanelSectionGrid, PanelWaitingList } from '@/components/shell/panel-overview'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
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
    <PanelPage
      title="Your control panel"
      lede="Everything about your account that you decide."
      gap="loose"
    >
      <Notice
        kind="info"
        message="Your profile is public. Your options and e-mail address are not."
        dismissHref={null}
      />

      <PanelSection id="waiting-heading" title="Waiting for you">
        <PanelWaitingList
          items={[
            {
              count: messages,
              one: 'unread message',
              many: 'unread messages',
              href: '/messages',
              action: 'Read',
            },
            {
              count: notifications,
              one: 'unread notification',
              many: 'unread notifications',
              href: '/notifications',
              action: 'Open',
            },
          ]}
          emptyTitle="Nothing unread"
          emptyDescription="No new messages and no new notifications."
        />
      </PanelSection>

      <PanelSection id="sections-heading" title="Sections">
        <PanelSectionGrid sections={USERCP_SECTIONS} />
      </PanelSection>
    </PanelPage>
  )
}
