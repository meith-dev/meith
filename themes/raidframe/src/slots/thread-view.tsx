import type { SlotCopy, ThreadViewModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { BUTTON, BUTTON_PRIMARY, HEADING, MICRO, NUMERIC, RULE } from '../shared'

const TAG = 'border px-1.5 py-px font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em]'

export function ThreadView({
  thread,
  forum,
  replyHref,
  markReadAction,
  regions,
  copy,
}: ThreadViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.threadView.${key}`)

  const reply =
    replyHref === null ? null : (
      <a href={replyHref} className={BUTTON_PRIMARY}>
        {c('postReply')}
      </a>
    )

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="border border-border bg-card shadow-elevation">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className={`${MICRO} normal-case`}>
              <a href={forum.href} className="uppercase hover:text-primary">
                {forum.label}
              </a>
            </p>
            <h1 className={`${HEADING} text-xl text-foreground`}>{thread.title}</h1>

            <p className="mt-1.5 flex flex-wrap items-center gap-2">
              {thread.isSticky && (
                <span className={`${TAG} border-thread-pinned/60 text-thread-pinned`}>
                  {c('pinned')}
                </span>
              )}
              {thread.isLocked && (
                <span className={`${TAG} border-thread-locked/60 text-thread-locked`}>
                  {c('locked')}
                </span>
              )}
              <span className={`${MICRO} ${NUMERIC} normal-case`}>
                <span className="text-foreground">{thread.replyCount.label}</span> {c('replies')}
                <span className="text-border">{' | '}</span>
                <span className="text-foreground">{thread.viewCount.label}</span> {c('views')}
              </span>
            </p>
          </div>

          {reply}
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.tools}</div>
      )}

      {regions.pagination}

      <div className="flex flex-col gap-3">{regions.posts}</div>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.afterContent}</div>
      )}

      {regions.quickReply}

      <div className="flex flex-wrap items-center gap-2">
        {reply}
        {markReadAction !== null && (
          <form action={markReadAction} method="post">
            <button type="submit" className={BUTTON}>
              {c('markRead')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
