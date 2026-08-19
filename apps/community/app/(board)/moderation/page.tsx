import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModerationQueue, QUEUE_PAGE_SIZE } from '@meith/moderation'
import { Card, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { QueueForm } from '@/components/moderation/queue-form'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
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

  const parts: string[] = []
  if (query.did !== undefined && query.n !== undefined) {
    const verb = query.did === 'approve' ? 'board.moderation.approved' : 'board.moderation.rejected'
    parts.push(translator.t(verb, { count: Number(query.n) }))
    if (query.refused !== undefined) {
      parts.push(translator.t('board.moderation.notModerated', { count: Number(query.refused) }))
    }
    if (query.gone !== undefined) {
      parts.push(translator.t('board.moderation.alreadyHandled', { count: Number(query.gone) }))
    }
  }
  const notice = parts.length === 0 ? null : parts.join(' ')

  return (
    <PanelPage
      title={await tr('page.approval-queue')}
      lede={
        view.pending === 1
          ? translator.t('board.moderation.awaiting', { count: 1 })
          : translator.t('board.moderation.awaiting', { count: view.pending })
      }
    >
      {notice !== null && <BoardNotice kind="info" message={notice} dismissHref="/moderation" />}

      {view.emptyReason !== null && (
        <Card>
          <Empty className="py-8">
            <EmptyTitle>
              {view.emptyReason === 'nothing-moderated'
                ? translator.t('board.moderation.nothingModerated')
                : translator.t('board.moderation.nothingWaiting')}
            </EmptyTitle>
            <EmptyDescription>
              {view.emptyReason === 'nothing-moderated'
                ? translator.t('board.moderation.nothingModeratedHint')
                : translator.t('board.moderation.nothingWaitingHint')}
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
