import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { PanelSectionGrid, PanelWaitingList } from '@/components/shell/panel-overview'
import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { panelSectionCopy } from '@/view/panel-nav'
import { USERCP_SECTIONS } from '@/view/usercp-nav'

export const metadata: Metadata = { title: 'Your control panel' }

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
        <PanelSectionGrid sections={panelSectionCopy(USERCP_SECTIONS, await getTranslator())} />
      </PanelSection>
    </PanelPage>
  )
}
