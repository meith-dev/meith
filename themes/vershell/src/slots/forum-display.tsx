import type { ForumDisplayModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  Action,
  CARD,
  Counts,
  isEmptyRegion,
  LABEL,
  Label,
  LEDE,
  META,
  PAGE_BODY,
  PAGE_TITLE,
  RULE,
  TOUCH,
} from '../shared'

export function ForumDisplay({
  forum,
  newThreadHref,
  markReadAction,
  regions,
  copy,
}: ForumDisplayModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.forumDisplay.${key}`)

  return (
    <div className={PAGE_BODY}>
      <header className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex min-w-0 flex-col gap-3">
          <Label>{c('label')}</Label>
          <h1 className={PAGE_TITLE}>{forum.title}</h1>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:items-end">
          {forum.description !== null && (
            <p className={`${LEDE} lg:text-end`}>{forum.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-end">
            {forum.type !== 'link' && (
              <Counts
                items={[
                  {
                    label: c('threadsLabel'),
                    value: forum.threadCount,
                    one: c('thread.one'),
                    many: c('thread.other'),
                  },
                  {
                    label: c('postsLabel'),
                    value: forum.postCount,
                    one: c('post.one'),
                    many: c('post.other'),
                  },
                ]}
              />
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
            {newThreadHref !== null && (
              <Action href={newThreadHref} className="ms-auto lg:ms-0">
                {c('newThread')}
              </Action>
            )}
          </div>
        </div>
      </header>

      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-4">{regions.announcements}</div>
      )}

      {regions.subforums}

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      <section aria-label={c('threadsLabel')} className={`${CARD} @container/card px-4 sm:px-6`}>
        <div
          className={`${LABEL} hidden grid-cols-[minmax(0,1fr)_9rem_15rem] gap-x-6 px-2 py-3 @3xl/card:grid`}
        >
          <span>{c('threadHeader')}</span>
          <span>{c('activityHeader')}</span>
          <span className="pl-5">{c('lastPostHeader')}</span>
        </div>

        {isEmptyRegion(regions.threads) ? (
          <div className="flex flex-col items-start gap-3 px-2 py-12">
            <p className="text-[1rem] font-medium text-foreground">{c('noThreadsYet')}</p>
            <p className={`${META} max-w-[32rem]`}>
              {newThreadHref === null ? c('emptyNoThread') : c('emptyNoThreadFirst')}
            </p>
            {newThreadHref !== null && (
              <Action href={newThreadHref} className="mt-2">
                {c('startFirstThread')}
              </Action>
            )}
          </div>
        ) : (
          <ul data-slot="card-rows">{regions.threads}</ul>
        )}
      </section>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div
          className={`${RULE} flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pt-4 empty:hidden`}
        >
          {regions.afterContent}
        </div>
      )}
    </div>
  )
}
