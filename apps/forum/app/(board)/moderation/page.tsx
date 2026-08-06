import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModerationQueue } from '@meith/moderation'
import { requireSlot } from '@meith/theme-kit'

import { QueueForm } from '@/components/moderation/queue-form'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import { buildQueueView } from '@/view/moderation-queue'

export const metadata: Metadata = { title: 'Moderation queue' }

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

  const Notice = requireSlot(await currentTheme(), 'Notice')

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
          <a href={view.nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Older items
          </a>
        )}
      </div>
    </main>
  )
}
