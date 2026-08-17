import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { NotificationPreferencesForm } from '@/components/account/notification-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { audiencesForActor } from '@/server/notification-audience'
import { notificationService } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { buildPreferencesView, notificationNotice } from '@/view/notifications'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.notification-preferences') }
}

export default async function NotificationPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const service = notificationService()

  if (actor.userId === null || service === null) notFound()
  const userId = actor.userId

  const audiences = await audiencesForActor()
  const rows = (
    await Promise.all(audiences.map((audience) => service.preferences(userId, audience)))
  ).flat()

  const view = buildPreferencesView(rows, await getTranslator())
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = notificationNotice(query, await getTranslator())

  return (
    <PanelPage
      back={{ href: view.backHref, label: 'Notifications' }}
      title={await tr('page.notification-preferences')}
      lede={await tr('page.which-board-s-notifications-also')}
    >
      {notice !== null && (
        <Notice kind="info" message={notice} dismissHref="/notifications/preferences" />
      )}

      <NotificationPreferencesForm rows={view.rows} />
    </PanelPage>
  )
}
