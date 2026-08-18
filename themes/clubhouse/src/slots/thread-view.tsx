import type { SlotCopy, ThreadViewModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Badge, cn } from '@meith/ui'

import { BUTTON, HEADING, MICRO, MUTED_LINK, NUMERIC, PAGE_BODY, PageHead, Prefix } from '../shared'

export function ThreadView({
  thread,
  forum,
  replyHref,
  markReadAction,
  regions,
  copy,
}: ThreadViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.threadView.${key}`)

  return (
    <div className={PAGE_BODY}>
      <PageHead
        actions={
          <>
            {markReadAction !== null && (
              <form action={markReadAction} method="post">
                <button
                  type="submit"
                  className={cn(
                    BUTTON,
                    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                  )}
                >
                  {c('markRead')}
                </button>
              </form>
            )}
            {replyHref !== null && (
              <a
                href={replyHref}
                className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary-hover')}
              >
                {c('reply')}
              </a>
            )}
          </>
        }
      >
        <a href={forum.href} className={`text-xs sm:hidden ${MUTED_LINK}`}>
          {forum.label}
        </a>

        <h1 className={`${HEADING} text-xl text-balance`}>{thread.title}</h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
          {thread.isSticky && <Badge tone="pinned">{c('pinned')}</Badge>}
          {thread.isLocked && <Badge tone="locked">{c('lockedNoReplies')}</Badge>}
          {thread.isMoved && <Badge tone="moved">{c('moved')}</Badge>}

          <span className={`${MICRO} ${NUMERIC}`}>
            {thread.replyCount.label} {c('replies')} · {thread.viewCount.label} {c('views')}
          </span>
        </div>
      </PageHead>

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
