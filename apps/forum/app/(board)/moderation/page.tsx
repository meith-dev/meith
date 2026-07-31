import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModerationQueue } from '@forum/moderation'
import { requireSlot } from '@forum/theme-kit'

import { QueueForm } from '@/components/moderation/queue-form'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { activeTheme } from '@/server/theme'
import { buildQueueView } from '@/view/moderation-queue'

export const metadata: Metadata = { title: 'Moderation queue' }

/**
 * F48 — what is waiting for approval, in the forums this actor moderates.
 *
 * **App-owned, not a theme slot**, and deliberately so. The 25-slot registry is
 * R6's list and is frozen at F77; a moderator tool is an operator surface like
 * the ACP (F63), which also has no slot. Committing the public theme contract
 * to a screen whose shape F54's ModCP has not designed yet would be the wrong
 * order. The theme still supplies everything around it — this route is inside
 * the board route group, so `PageShell` wraps it like any other page.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{
    after?: string
    did?: string
    n?: string
    refused?: string
    gone?: string
  }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { authorizer, moderationQueue } = getContainer()
  /*
   * Fixture mode has no queue, and a screen that lists nothing while claiming
   * to be the queue is worse than no screen (D38/D32). A guest gets the same
   * answer a member without rights gets: this page is not here.
   */
  if (moderationQueue === null || actor.userId === null) notFound()

  const moderated = await authorizer.moderatedForumIds(actor)
  const queue = new ModerationQueue({ queue: moderationQueue })
  const [page, pending] = await Promise.all([
    queue.list(moderated, query.after === undefined ? {} : { after: query.after }),
    queue.countPending(moderated),
  ])

  const view = buildQueueView({
    items: page.items,
    pending,
    nextCursor: page.nextCursor,
    moderatesAnything: moderated.length > 0,
    now: new Date(),
  })

  const Notice = requireSlot(activeTheme, 'Notice')

  /*
   * Counts, not a bare "done". A moderator who selected twelve and moved eleven
   * has to be told, or the screen and the board disagree about what just
   * happened and only one of them is right.
   */
  const parts: string[] = []
  if (query.did !== undefined && query.n !== undefined) {
    const verb = query.did === 'approve' ? 'Approved' : 'Rejected'
    parts.push(`${verb} ${query.n} item${query.n === '1' ? '' : 's'}.`)
    if (query.refused !== undefined) {
      parts.push(`${query.refused} were in forums you do not moderate.`)
    }
    if (query.gone !== undefined) {
      parts.push(`${query.gone} had already been handled.`)
    }
  }
  const notice = parts.length === 0 ? null : parts.join(' ')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold">Moderation queue</h1>
          <p className="text-sm text-muted-foreground">
            {view.pending} awaiting approval
          </p>
        </div>

        {notice !== null && (
          <Notice kind="info" message={notice} dismissHref="/moderation" />
        )}

        {view.emptyReason === 'nothing-moderated' && (
          <p className="text-sm text-muted-foreground">
            You do not moderate any forums.
          </p>
        )}
        {view.emptyReason === 'queue-empty' && (
          <p className="text-sm text-muted-foreground">Nothing is waiting. </p>
        )}

        {view.rows.length > 0 && <QueueForm rows={view.rows} />}

        {view.nextHref !== null && (
          <a href={view.nextHref} className="text-sm text-primary hover:underline">
            Older items
          </a>
        )}
      </div>
    </main>
  )
}
