import type { SlotCopy, ThreadViewModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  Action,
  Counts,
  LABEL,
  Mark,
  PAGE_BODY,
  PAGE_TITLE,
  Prefix,
  QUIET_LINK,
  RULE,
  TOUCH,
} from '../shared'

export function ThreadView({
  thread,
  forum,
  replyHref,
  markReadAction,
  watch,
  regions,
  copy,
}: ThreadViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.threadView.${key}`)

  return (
    <div className={PAGE_BODY}>
      <header className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex min-w-0 flex-col gap-3">
          <p className={`${LABEL} flex flex-wrap items-center gap-x-3 gap-y-1`}>
            <span>
              {c('label')}{' '}
              <a href={forum.href} className={`text-foreground ${QUIET_LINK}`}>
                {forum.label}
              </a>
            </span>
            {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
            {thread.isSticky && <Mark tone="thread-pinned">{c('pinned')}</Mark>}
            {thread.isLocked && <Mark tone="thread-locked">{c('locked')}</Mark>}
            {thread.isMoved && <Mark tone="thread-moved">{c('moved')}</Mark>}
          </p>
          <h1 className={PAGE_TITLE}>{thread.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-end">
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
          {watch != null && (
            <form action={watch.action} method="post">
              <button
                type="submit"
                className={`${LABEL} inline-flex items-center gap-1 py-2 transition-colors hover:text-foreground ${TOUCH}`}
              >
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
              <button
                type="submit"
                className={`${LABEL} inline-flex items-center py-2 transition-colors hover:text-foreground ${TOUCH}`}
              >
                {c('markRead')}
              </button>
            </form>
          )}
          {replyHref !== null && (
            <Action href={replyHref} className="ms-auto lg:ms-0">
              {c('replyAction')}
            </Action>
          )}
        </div>
      </header>

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      <div className="flex flex-col gap-4">{regions.posts}</div>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div
          className={`${RULE} flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pt-4 empty:hidden`}
        >
          {regions.afterContent}
        </div>
      )}

      {regions.quickReply}
    </div>
  )
}
