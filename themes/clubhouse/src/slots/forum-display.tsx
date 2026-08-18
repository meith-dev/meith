import type { ForumDisplayModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardRows, cn, Empty, EmptyAction, EmptyDescription, EmptyTitle } from '@meith/ui'

import {
  BUTTON,
  ColumnHeads,
  HEADING,
  isEmptyRegion,
  MICRO,
  NUMERIC,
  PAGE_BODY,
  PageHead,
} from '../shared'

export function ForumDisplay({
  forum,
  newThreadHref,
  markReadAction,
  regions,
  copy,
}: ForumDisplayModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.forumDisplay.${key}`)

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
            {newThreadHref !== null && (
              <a
                href={newThreadHref}
                className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary-hover')}
              >
                {c('newThread')}
              </a>
            )}
          </>
        }
      >
        <h1 className={`${HEADING} text-xl text-balance`}>{forum.title}</h1>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          {forum.type !== 'link' && (
            <span className={`${MICRO} ${NUMERIC}`}>
              {forum.threadCount.label} {c('threads')} · {forum.postCount.label} {c('posts')}
            </span>
          )}
          {forum.description !== null && <span>{forum.description}</span>}
        </p>
      </PageHead>

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {regions.subforums}

      <Card>
        {isEmptyRegion(regions.threads) ? (
          <Empty>
            <EmptyTitle>{c('noThreadsYet')}</EmptyTitle>
            <EmptyDescription>
              {newThreadHref === null ? c('emptyNoThread') : c('emptyNoThreadFirst')}
            </EmptyDescription>
            {newThreadHref !== null && (
              <EmptyAction>
                <a
                  href={newThreadHref}
                  className={cn(
                    BUTTON,
                    'bg-primary text-primary-foreground hover:bg-primary-hover',
                  )}
                >
                  {c('startFirstThread')}
                </a>
              </EmptyAction>
            )}
          </Empty>
        ) : (
          <>
            <ColumnHeads
              first={c('thread')}
              counts={[c('replies'), c('views')]}
              last={c('latest')}
            />
            <CardRows>{regions.threads}</CardRows>
          </>
        )}
      </Card>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-4 empty:hidden">
          {regions.afterContent}
        </div>
      )}
    </div>
  )
}
