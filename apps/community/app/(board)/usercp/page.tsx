import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot, slotCopy } from '@meith/theme-kit'

import { PanelSectionGrid, PanelWaitingList } from '@/components/shell/panel-overview'
import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { panelSectionCopy } from '@/view/panel-nav'
import { USERCP_SECTIONS } from '@/view/usercp-nav'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.control-panel-2') }
}

export default async function UserCpPage() {
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const translator = await getTranslator()

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  return (
    <PanelPage
      title={await tr('page.control-panel-2')}
      lede={await tr('page.everything-about-account-that-decide')}
      gap="loose"
    >
      <Notice
        kind="info"
        message={translator.t('board.usercp.profilePrivacy')}
        dismissHref={null}
        copy={slotCopy(await currentTheme(), 'Notice', await getTranslator())}
      />

      <PanelSection id="waiting-heading" title={await tr('page.waiting-for')}>
        <PanelWaitingList
          items={[
            {
              count: messages,
              one: translator.t('board.usercp.unreadMessage', { count: 1 }),
              many: translator.t('board.usercp.unreadMessage', { count: 2 }),
              href: '/messages',
              action: translator.t('board.usercp.read'),
            },
            {
              count: notifications,
              one: translator.t('board.usercp.unreadNotification', { count: 1 }),
              many: translator.t('board.usercp.unreadNotification', { count: 2 }),
              href: '/notifications',
              action: translator.t('board.usercp.open'),
            },
          ]}
          emptyTitle={translator.t('board.usercp.emptyTitle')}
          emptyDescription={translator.t('board.usercp.emptyDescription')}
        />
      </PanelSection>

      <PanelSection id="sections-heading" title={await tr('page.sections')}>
        <PanelSectionGrid sections={panelSectionCopy(USERCP_SECTIONS, translator)} />
      </PanelSection>
    </PanelPage>
  )
}
