import type { ForumDisplayModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  buttonVariants,
  Card,
  CardRows,
  cn,
  Empty,
  EmptyAction,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'

import { Counts, isEmptyRegion, PAGE_BODY, PAGE_TITLE } from '../shared'

export function ForumDisplay({
  forum,
  newThreadHref,
  markReadAction,
  regions,
  copy,
}: ForumDisplayModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.forumDisplay.${key}`)

  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className={PAGE_TITLE}>{forum.title}</h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {forum.description !== null && <p className="max-w-prose">{forum.description}</p>}
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
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                {c('markRead')}
              </button>
            </form>
          )}
          {newThreadHref !== null && (
            <a
              href={newThreadHref}
              className={cn(buttonVariants({ variant: 'primary' }), 'ms-auto sm:ms-0')}
            >
              {c('newThread')}
            </a>
          )}
        </div>
      </div>

      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {regions.subforums}

      {regions.tools !== undefined && (
        <div className="-mb-2 flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      <Card className="rounded-xl">
        {isEmptyRegion(regions.threads) ? (
          <Empty>
            <EmptyTitle>{c('noThreadsYet')}</EmptyTitle>
            <EmptyDescription>
              {newThreadHref === null ? c('emptyNoThread') : c('emptyNoThreadFirst')}
            </EmptyDescription>
            {newThreadHref !== null && (
              <EmptyAction>
                <a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
                  {c('startFirstThread')}
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
