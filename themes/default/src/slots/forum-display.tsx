import {
  Card,
  CardRows,
  Empty,
  EmptyAction,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
} from '@meith/ui'
import type { ForumDisplayModel } from '@meith/theme-kit'

import { Counts, PAGE_BODY, isEmptyRegion } from '../shared'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {forum.title}
          </h1>
          {forum.description !== null && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{forum.description}</p>
          )}
          {forum.type !== 'link' && (
            <Counts
              className="mt-2"
              items={[
                {
                  label: 'Threads',
                  value: forum.threadCount,
                  one: 'thread',
                  many: 'threads',
                },
                {
                  label: 'Posts',
                  value: forum.postCount,
                  one: 'post',
                  many: 'posts',
                },
              ]}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                Mark read
              </button>
            </form>
          )}
          {newThreadHref !== null && (
            <a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
              New thread
            </a>
          )}
        </div>
      </div>

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
                <a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
                  Start the first thread
                </a>
              </EmptyAction>
            )}
          </Empty>
        ) : (
          <CardRows>{regions.threads}</CardRows>
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
