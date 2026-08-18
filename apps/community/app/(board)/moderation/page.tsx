import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModerationQueue, QUEUE_PAGE_SIZE } from '@meith/moderation'
import { requireSlot, slotCopy } from '@meith/theme-kit'
import { Card, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { QueueForm } from '@/components/moderation/queue-form'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { moderationFormsCopy } from '@/view/moderation-copy'
import { buildQueueView } from '@/view/moderation-queue'
import { offsetOf, readPage } from '@/view/pager'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.moderation-queue') }
}

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
  const pageNumber = readPage(query)
  const [page, pending] = await Promise.all([
    queue.list(moderated, { offset: offsetOf(pageNumber, QUEUE_PAGE_SIZE) }),
    queue.countPending(moderated),
  ])

  const translator = await getTranslator()

  const view = buildQueueView({
    items: page.items,
    pending,
    nextCursor: page.nextCursor,
    moderatesAnything: moderated.length > 0,
    now: new Date(),
    t: translator,
  })

  const theme = await currentTheme()
  const Notice = requireSlot(theme, 'Notice')

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
      title={await tr('page.approval-queue')}
      lede={
        view.pending === 1
          ? '1 item awaiting approval.'
          : `${view.pending} items awaiting approval.`
      }
    >
      {notice !== null && (
        <Notice
          kind="info"
          message={notice}
          dismissHref="/moderation"
          copy={slotCopy(theme, 'Notice', translator)}
        />
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

      {view.rows.length > 0 && (
        <QueueForm rows={view.rows} copy={moderationFormsCopy(await getTranslator())} />
      )}

      <PanelPagination
        path="/moderation"
        params={query}
        page={pageNumber}
        pageSize={QUEUE_PAGE_SIZE}
        total={pending}
      />
    </PanelPage>
  )
}
