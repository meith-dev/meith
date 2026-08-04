import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { NotificationPreferencesForm } from '@/components/account/notification-forms'
import { getActor } from '@/server/context'
import { audiencesForActor } from '@/server/notification-audience'
import { notificationService } from '@/server/notifications'
import { activeTheme } from '@/server/theme'
import { buildPreferencesView, notificationNotice } from '@/view/notifications'

export const metadata: Metadata = { title: 'Notification preferences' }

/**
 * F55 — which notifications also arrive by e-mail.
 *
 * Every row is a *kind* from the registry rather than a stored row, so a member
 * who has never been here sees the defaults, and a kind added in a later deploy
 * appears for everybody at once instead of only for people who have never
 * saved. That is the same argument F08 makes for storing only setting
 * overrides.
 *
 * There is deliberately no on-site column to switch off — see the centre.
 *
 * This is the first screen of what F57's UserCP will eventually contain, and it
 * lives at `/notifications/preferences` rather than under a `/usercp` that does
 * not exist. When F57 arrives it gains a home; it does not need one to work.
 */
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

  /*
   * The audiences the *actor* is entitled to, resolved by the same function the
   * save action uses. Sharing it is what keeps the screen and the write in
   * step: a rendered checkbox the save path ignores is a control that silently
   * does nothing.
   */
  const audiences = await audiencesForActor()
  const rows = (
    await Promise.all(
      audiences.map((audience) => service.preferences(userId, audience)),
    )
  ).flat()

  const view = buildPreferencesView(rows)
  const Notice = requireSlot(activeTheme, 'Notice')
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
