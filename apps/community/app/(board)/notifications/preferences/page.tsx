import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  AnnouncementsOptInForm,
  BoardDigestCadenceForm,
  NotificationPreferencesForm,
} from '@/components/account/notification-forms'
import { PushDeviceForm } from '@/components/account/push-device-form'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { audiencesForActor } from '@/server/notification-audience'
import { notificationService } from '@/server/notifications'
import { pushAvailability } from '@/server/push'
import { notificationFormsCopy } from '@/view/account-copy'
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

  const { memberSettings } = getContainer()
  const settings = memberSettings === null ? null : await memberSettings.read(userId)

  const push = await pushAvailability()
  const view = buildPreferencesView(rows, await getTranslator())
  const notice = notificationNotice(query, await getTranslator())

  return (
    <PanelPage
      back={{ href: view.backHref, label: 'Notifications' }}
      title={await tr('page.notification-preferences')}
      lede={await tr('page.which-board-s-notifications-also')}
    >
      {notice !== null && (
        <BoardNotice kind="info" message={notice} dismissHref="/notifications/preferences" />
      )}

      {push.enabled && (
        <PushDeviceForm
          publicKey={push.publicKey}
          copy={notificationFormsCopy(await getTranslator())}
        />
      )}

      <NotificationPreferencesForm
        rows={view.rows}
        push={push.enabled}
        copy={notificationFormsCopy(await getTranslator())}
      />

      {settings !== null && (
        <BoardDigestCadenceForm
          cadence={settings.boardDigestCadence}
          copy={notificationFormsCopy(await getTranslator())}
        />
      )}

      {settings !== null && (
        <AnnouncementsOptInForm
          optedIn={settings.massMailOptInAt !== null}
          copy={notificationFormsCopy(await getTranslator())}
        />
      )}
    </PanelPage>
  )
}
