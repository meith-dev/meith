import type { Metadata } from 'next'

import {
  AnnouncementRowForm,
  NewAnnouncementForm,
  type AnnouncementValues,
  type ForumChoice,
} from '@/components/admin/content-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { announcementRepository } from '@/server/announcements'
import { getContainer } from '@/server/container'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE } from '@/components/shell/panel-list'
import { cn } from '@meith/ui'

export const metadata: Metadata = { title: 'Announcements' }

export default async function AdminAnnouncementsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = announcementRepository()
  if (repository === null) {
    return (
      <PanelPage title="Announcements">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it stores no announcements.
        </p>
      </PanelPage>
    )
  }

  const { forums } = getContainer()
  const [rows, tree] = await Promise.all([repository.list(), forums.listListing()])

  const choices: readonly ForumChoice[] = tree
    .filter((row) => row.type === 'forum')
    .map((row) => ({
      id: row.id,
      label: `${' '.repeat(row.depth)}${row.title}`,
    }))

  const forInput = (at: Date | null): string =>
    at === null ? '' : at.toISOString().slice(0, 16)

  const now = new Date()

  return (
    <PanelPage
      back={{ href: '/admin/content', label: 'Content' }}
      title="Announcements"
      lede={
        <>
          A dated notice above the forums. Nobody can reply to one, it disappears on its
          own date, and removing it removes nothing anybody wrote — which is what makes it
          a different thing from a pinned thread rather than a worse one.
        </>
      }
      gap="loose"
    >
      {rows.length === 0 ? (
        <p className={PANEL_NOTE}>
          None. The board shows no announcements.
        </p>
      ) : (
        <section className={cn(PANEL_LIST, 'px-4')}>
          {rows.map((row) => {
            const live =
              row.enabled &&
              row.startsAt <= now &&
              (row.endsAt === null || row.endsAt > now)
            const state = !row.enabled
              ? 'switched off'
              : row.startsAt > now
                ? 'scheduled'
                : row.endsAt !== null && row.endsAt <= now
                  ? 'expired'
                  : 'showing now'

            const values: AnnouncementValues = {
              id: row.id,
              forumId: row.forumId,
              title: row.title,
              message: row.message,
              startsAtInput: forInput(row.startsAt),
              endsAtInput: forInput(row.endsAt),
              enabled: row.enabled,
            }

            return (
              <div key={row.id} className="flex flex-col gap-1">
                <p className="pt-4 text-xs text-muted-foreground">
                  <span className={live ? 'font-medium text-foreground' : 'font-medium'}>
                    {state}
                  </span>
                  {' · '}
                  {row.forumTitle ?? 'the whole board'}
                  {row.authorUsername !== '' && ` · by ${row.authorUsername}`}
                </p>
                <AnnouncementRowForm announcement={values} forums={choices} />
              </div>
            )
          })}
        </section>
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">New announcement</h2>
        <NewAnnouncementForm forums={choices} />
      </section>
    </PanelPage>
  )
}
