import type { ThreadViewModel } from '@meith/theme-kit'

import {
  BTN,
  BTN_PRIMARY,
  COLUMN,
  Hash,
  MUTED_LINK,
  NUMERIC,
  PAGE,
  PANEL,
  Prefix,
  Tag,
  count,
  plural,
} from '../shared'

export function ThreadView({ thread, forum, replyHref, markReadAction, regions }: ThreadViewModel) {
  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${COLUMN} flex flex-col gap-4`}>
        <section className={`${PANEL} px-4 py-3.5`}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <a
                href={forum.href}
                className={`inline-flex items-center text-xs font-medium ${MUTED_LINK}`}
              >
                <Hash className="text-sm" />
                {forum.label}
              </a>

              <h1 className="mt-1 text-xl leading-tight font-bold tracking-tight text-balance">
                {thread.title}
              </h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
                {thread.isSticky && <Tag token="thread-pinned">Pinned</Tag>}
                {thread.isLocked && <Tag token="thread-locked">Locked — no new replies</Tag>}
                {thread.isMoved && <Tag token="thread-moved">Moved</Tag>}

                <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
                  {count(thread.replyCount)} {plural(thread.replyCount, 'reply', 'replies')} ·{' '}
                  {count(thread.viewCount)} {plural(thread.viewCount, 'view', 'views')}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {markReadAction !== null && (
                <form action={markReadAction} method="post">
                  <button type="submit" className={BTN}>
                    Mark read
                  </button>
                </form>
              )}
              {replyHref !== null && (
                <a href={replyHref} className={BTN_PRIMARY}>
                  Reply
                </a>
              )}
            </div>
          </div>
        </section>

        {regions.tools !== undefined && (
          <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
        )}

        <div className={`${PANEL} flex flex-col py-2`}>{regions.posts}</div>

        {regions.pagination}

        {regions.afterContent !== undefined && (
          <div
            className={`${PANEL} flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-3 empty:hidden`}
          >
            {regions.afterContent}
          </div>
        )}

        {regions.quickReply}
      </div>
    </div>
  )
}
