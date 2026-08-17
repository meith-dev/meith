import type { ThreadViewModel } from '@meith/theme-kit'
import { Badge, buttonVariants } from '@meith/ui'

import { Counts, MUTED_LINK, PAGE_BODY, Prefix } from '../shared'

export function ThreadView({ thread, forum, replyHref, markReadAction, regions }: ThreadViewModel) {
  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <a href={forum.href} className={`text-sm sm:hidden ${MUTED_LINK}`}>
            {forum.label}
          </a>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:mt-0">
            {thread.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
            {thread.isSticky && <Badge tone="pinned">Pinned</Badge>}
            {thread.isLocked && <Badge tone="locked">Locked — no new replies</Badge>}
            {thread.isMoved && <Badge tone="moved">Moved</Badge>}

            <Counts
              items={[
                {
                  label: 'Replies',
                  value: thread.replyCount,
                  one: 'reply',
                  many: 'replies',
                },
                {
                  label: 'Views',
                  value: thread.viewCount,
                  one: 'view',
                  many: 'views',
                },
              ]}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                Mark read
              </button>
            </form>
          )}
          {replyHref !== null && (
            <a href={replyHref} className={buttonVariants({ variant: 'primary' })}>
              Reply
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
