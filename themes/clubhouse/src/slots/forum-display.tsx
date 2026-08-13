import { Card, CardRows, Empty, EmptyAction, EmptyDescription, EmptyTitle, cn } from '@meith/ui'
import type { ForumDisplayModel } from '@meith/theme-kit'

import {
  BUTTON,
  ColumnHeads,
  HEADING,
  MICRO,
  NUMERIC,
  PAGE_BODY,
  PageHead,
  isEmptyRegion,
} from '../shared'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
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
            {newThreadHref !== null && (
              <a
                href={newThreadHref}
                className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary-hover')}
              >
                New thread
              </a>
            )}
          </>
        }
      >
        <h1 className={`${HEADING} text-xl text-balance`}>{forum.title}</h1>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          {forum.type !== 'link' && (
            <span className={`${MICRO} ${NUMERIC}`}>
              {forum.threadCount.toLocaleString('en')} threads ·{' '}
              {forum.postCount.toLocaleString('en')} posts
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
            <EmptyTitle>No threads here yet</EmptyTitle>
            <EmptyDescription>
              {newThreadHref === null
                ? 'Nothing has been posted in this forum.'
                : 'Nothing has been posted in this forum. Yours would be the first.'}
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
                  Start the first thread
                </a>
              </EmptyAction>
            )}
          </Empty>
        ) : (
          <>
            <ColumnHeads first="Thread" counts={['Replies', 'Views']} last="Latest" />
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
