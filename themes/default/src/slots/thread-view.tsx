import type { SlotCopy, ThreadViewModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Badge, buttonVariants, cn } from '@meith/ui'

import { Counts, PAGE_BODY, Prefix } from '../shared'

export function ThreadView({
  thread,
  replyHref,
  markReadAction,
  watch,
  regions,
  copy,
}: ThreadViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.threadView.${key}`)

  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{thread.title}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
            {thread.isSticky && <Badge tone="pinned">{c('pinned')}</Badge>}
            {thread.isLocked && <Badge tone="locked">{c('locked')}</Badge>}
            {thread.isMoved && <Badge tone="moved">{c('moved')}</Badge>}

            <Counts
              items={[
                {
                  label: c('repliesLabel'),
                  value: thread.replyCount,
                  one: c('reply.one'),
                  many: c('reply.other'),
                },
                {
                  label: c('viewsLabel'),
                  value: thread.viewCount,
                  one: c('view.one'),
                  many: c('view.other'),
                },
              ]}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {watch != null && (
            <form action={watch.action} method="post">
              <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                {watch.subscribed ? (
                  <>
                    {c('watching')} <span aria-hidden="true">✓</span>
                  </>
                ) : (
                  c('watch')
                )}
              </button>
            </form>
          )}
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                {c('markRead')}
              </button>
            </form>
          )}
          {replyHref !== null && (
            <a
              href={replyHref}
              className={cn(buttonVariants({ variant: 'primary' }), 'ms-auto sm:ms-0')}
            >
              {c('replyAction')}
            </a>
          )}
        </div>
      </div>

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      <div className="flex flex-col gap-3">{regions.posts}</div>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-4 empty:hidden">
          {regions.afterContent}
        </div>
      )}

      {regions.quickReply}
    </div>
  )
}
