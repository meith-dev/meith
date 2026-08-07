import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModerationQueue } from '@meith/moderation'
import { requireSlot } from '@meith/theme-kit'
import { Card, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { QueueForm } from '@/components/moderation/queue-form'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
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

  const Notice = requireSlot(await currentTheme(), 'Notice')

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
    <PanelPage
      title="Approval queue"
      lede={
        view.pending === 1
          ? '1 post awaiting approval.'
          : `${view.pending} posts awaiting approval.`
      }
    >
      {notice !== null && (
        <Notice kind="info" message={notice} dismissHref="/moderation" />
      )}

      {view.emptyReason !== null && (
        <Card>
          <Empty className="py-8">
            <EmptyTitle>
              {view.emptyReason === 'nothing-moderated'
                ? 'You do not moderate any forums'
                : 'Nothing is waiting'}
            </EmptyTitle>
            <EmptyDescription>
              {view.emptyReason === 'nothing-moderated'
                ? 'Posts held for approval appear here once you are appointed to a forum, or given a group permission that moderates one.'
                : 'Every post held for approval in the forums you moderate has been dealt with.'}
            </EmptyDescription>
          </Empty>
        </Card>
      )}

      {view.rows.length > 0 && <QueueForm rows={view.rows} />}

      {view.nextHref !== null && (
        <a
          href={view.nextHref}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Older items
        </a>
      )}
    </PanelPage>
  )
}
