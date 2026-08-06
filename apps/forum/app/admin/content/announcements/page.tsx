import type { Metadata } from 'next'

import {
  AnnouncementRowForm,
  NewAnnouncementForm,
  type AnnouncementValues,
  type ForumChoice,
} from '@/components/admin/content-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { announcementRepository } from '@/server/announcements'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Announcements' }

/**
 * F71 — announcements.
 *
 * **An announcement is chrome, not content, and the whole model follows from
 * that.** A sticky thread is a conversation: members reply to it, it belongs to
 * its author, and taking it down deletes what they said — which is why boards
 * built on pinned threads end up with a three-year-old rules post at the top of
 * every forum. This is a dated notice nobody can reply to, that expires on its
 * own, and whose removal removes nothing anybody wrote. That is what makes the
 * delete button here safe and the same button on a sticky thread not.
 *
 * Its own screen rather than a section on `/admin/content`, because an
 * announcement is a body of text with a schedule rather than a row in a
 * vocabulary — the form is a composer, and four of them on a page of one-line
 * lists reads as a different screen that got pasted in.
 */
export default async function AdminAnnouncementsPage() {
  await requireAdmin()

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

  /*
   * Categories are excluded: nobody reads a category page, so an announcement
   * on one would be written and never seen. Offering the choice would be
   * offering a way to publish into a void.
   */
  const choices: readonly ForumChoice[] = tree
    .filter((row) => row.type === 'forum')
    .map((row) => ({
      id: row.id,
      label: `${' '.repeat(row.depth)}${row.title}`,
    }))

  /* `datetime-local` wants `YYYY-MM-DDTHH:mm`, and the action reads it as UTC. */
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
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          None. The board shows no announcements.
        </p>
      ) : (
        <section className="flex flex-col divide-y divide-border rounded-lg border border-border px-4">
          {rows.map((row) => {
            /*
             * Said plainly rather than left for the operator to work out from
             * two dates and a checkbox. "Why is my announcement not showing" is
             * the question this screen exists to answer before it is asked.
             */
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

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">New announcement</h2>
        <NewAnnouncementForm forums={choices} />
      </section>
    </PanelPage>
  )
}
