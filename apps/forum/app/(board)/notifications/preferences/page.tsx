import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { NotificationPreferencesForm } from '@/components/account/notification-forms'
import { getActor } from '@/server/context'
import { audiencesForActor } from '@/server/notification-audience'
import { notificationService } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { buildPreferencesView, notificationNotice } from '@/view/notifications'

export const metadata: Metadata = { title: 'Notification preferences' }

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
    await Promise.all(
      audiences.map((audience) => service.preferences(userId, audience)),
    )
  ).flat()

  const view = buildPreferencesView(rows)
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = notificationNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice
            kind="info"
            message={notice}
            dismissHref="/notifications/preferences"
          />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Notification preferences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href={view.backHref} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Back to your notifications
            </a>
          </p>
        </div>

        <NotificationPreferencesForm rows={view.rows} />
      </div>
    </main>
  )
}
