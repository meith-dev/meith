import type { LatestThreadsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardContent, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { LINK, MICRO, MUTED_LINK, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

export function LatestThreads({
  threads,
  capturedAt,
  copy,
}: LatestThreadsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.latestThreads.${key}`)

  return (
    <Card aria-labelledby="latest-threads-heading">
      <PanelHead
        id="latest-threads-heading"
        title={c('title')}
        aside={
          <span className={MICRO}>
            {c('asOf')} <Stamp at={capturedAt} />
          </span>
        }
      />

      {threads.length === 0 ? (
        <Empty className="py-5">
          <EmptyTitle>{c('nothingStartedYet')}</EmptyTitle>
          <EmptyDescription>{c('newestThreadsEmpty')}</EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.href} className="flex flex-col gap-0.5 px-4 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href={thread.href}
                    className={`truncate text-sm font-semibold text-foreground ${LINK}`}
                  >
                    {thread.title}
                  </a>
                  <span className={`shrink-0 text-xs text-muted-foreground ${NUMERIC}`}>
                    {thread.replyCount.label}
                  </span>
                </div>

                <p className="truncate text-xs text-muted-foreground">
                  <UserRef user={thread.author} className="font-medium" />
                  {` ${c('in')} `}
                  <a href={thread.forum.href} className={MUTED_LINK}>
                    {thread.forum.label}
                  </a>
                  {' · '}
                  <Stamp at={thread.startedAt} />
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
