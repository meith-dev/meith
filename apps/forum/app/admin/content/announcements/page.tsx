import type { Metadata } from 'next'

import {
  AnnouncementRowForm,
  NewAnnouncementForm,
  type AnnouncementValues,
  type ForumChoice,
} from '@/components/admin/content-forms'
import { requireAdmin } from '@/server/admin'
import { announcementRepository } from '@/server/announcements'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Announcements' }

export default async function AdminAnnouncementsPage() {
  await requireAdmin()

  const repository = announcementRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Announcements</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it stores no
          announcements.
        </p>
      </div>
    )
  }

  const { forums } = getContainer()
  const [rows, tree] = await Promise.all([repository.list(), forums.listListing()])

  const choices: readonly ForumChoice[] = tree
    .filter((row) => row.type === 'forum')
    .map((row) => ({ id: row.id, label: `${' '.repeat(row.depth)}${row.title}` }))

  const forInput = (at: Date | null): string =>
    at === null ? '' : at.toISOString().slice(0, 16)

  const now = new Date()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/content" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          ← Content
        </a>
        <h1 className="font-serif text-2xl font-semibold">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          A dated notice above the forums. Nobody can reply to one, it disappears
          on its own date, and removing it removes nothing anybody wrote — which
          is what makes it a different thing from a pinned thread rather than a
          worse one.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          None. The board shows no announcements.
        </p>
      ) : (
        <section className="flex flex-col divide-y divide-border rounded-lg border border-border px-4">
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

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">New announcement</h2>
        <NewAnnouncementForm forums={choices} />
      </section>
    </div>
  )
}
