import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import {
  AnnouncementRowForm,
  type AnnouncementValues,
  type ForumChoice,
  NewAnnouncementForm,
} from '@/components/admin/content-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { announcementRepository } from '@/server/announcements'
import { getContainer } from '@/server/container'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.announcements') }
}

export default async function AdminAnnouncementsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = announcementRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.announcements')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-5')}
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

  const forInput = (at: Date | null): string => (at === null ? '' : at.toISOString().slice(0, 16))

  const now = new Date()

  return (
    <PanelPage
      back={{ href: '/admin/content', label: 'Content' }}
      title={await tr('page.announcements')}
      lede={
        <>
          A dated notice above the forums. Nobody can reply to one, it disappears on its own date,
          and removing it removes nothing anybody wrote — which is what makes it a different thing
          from a pinned thread rather than a worse one.
        </>
      }
      gap="loose"
    >
      {rows.length === 0 ? (
        <p className={PANEL_NOTE}>{await tr('page.none-board-shows-no-announcements')}</p>
      ) : (
        <section className={cn(PANEL_LIST, 'px-4')}>
          {rows.map((row) => {
            const live =
              row.enabled && row.startsAt <= now && (row.endsAt === null || row.endsAt > now)
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
        <h2 className="font-heading text-lg font-semibold">{await tr('page.new-announcement')}</h2>
        <NewAnnouncementForm forums={choices} />
      </section>
    </PanelPage>
  )
}
