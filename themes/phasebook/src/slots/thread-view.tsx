import type { SlotCopy, ThreadViewModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  count,
  FEED,
  MUTED_LINK,
  NUMERIC,
  PAGE,
  PILL,
  PILL_PRIMARY,
  Prefix,
  plural,
  Tag,
} from '../shared'

export function ThreadView({
  thread,
  forum,
  replyHref,
  markReadAction,
  regions,
  copy,
}: ThreadViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.threadView.${key}`)

  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        <section className="rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <a href={forum.href} className={`text-xs font-semibold ${MUTED_LINK}`}>
                {forum.label}
              </a>

              <h1 className="mt-0.5 text-xl leading-tight font-bold tracking-tight text-balance">
                {thread.title}
              </h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
                {thread.isSticky && <Tag token="thread-pinned">{c('pinned')}</Tag>}
                {thread.isLocked && <Tag token="thread-locked">{c('locked')}</Tag>}
                {thread.isMoved && <Tag token="thread-moved">{c('moved')}</Tag>}

                <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
                  {count(thread.replyCount)}{' '}
                  {plural(thread.replyCount, c('reply.one'), c('reply.other'))} ·{' '}
                  {count(thread.viewCount)}{' '}
                  {plural(thread.viewCount, c('view.one'), c('view.other'))}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {markReadAction !== null && (
                <form action={markReadAction} method="post">
                  <button type="submit" className={PILL}>
                    {c('markRead')}
                  </button>
                </form>
              )}
              {replyHref !== null && (
                <a href={replyHref} className={PILL_PRIMARY}>
                  {c('replyAction')}
                </a>
              )}
            </div>
          </div>
        </section>

        {regions.tools !== undefined && (
          <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
        )}

        <div className="flex flex-col gap-3">{regions.posts}</div>

        {regions.pagination}

        {regions.afterContent !== undefined && (
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 shadow-elevation empty:hidden">
            {regions.afterContent}
          </div>
        )}

        {regions.quickReply}
      </div>
    </div>
  )
}
