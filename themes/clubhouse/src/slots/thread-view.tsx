import type { ThreadViewModel } from '@meith/theme-kit'
import { formatCount } from '@meith/theme-kit'
import { Badge, cn } from '@meith/ui'

import { BUTTON, HEADING, MICRO, MUTED_LINK, NUMERIC, PAGE_BODY, PageHead, Prefix } from '../shared'

export function ThreadView({ thread, forum, replyHref, markReadAction, regions }: ThreadViewModel) {
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
                  Mark read
                </button>
              </form>
            )}
            {replyHref !== null && (
              <a
                href={replyHref}
                className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary-hover')}
              >
                Reply
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
          {thread.isSticky && <Badge tone="pinned">Pinned</Badge>}
          {thread.isLocked && <Badge tone="locked">Locked — no new replies</Badge>}
          {thread.isMoved && <Badge tone="moved">Moved</Badge>}

          <span className={`${MICRO} ${NUMERIC}`}>
            {formatCount(thread.replyCount)} replies · {formatCount(thread.viewCount)} views
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
