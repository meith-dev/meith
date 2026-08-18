import type { LatestThreadsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

export function LatestThreads({
  threads,
  capturedAt,
  copy,
}: LatestThreadsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.latestThreads.${key}`)

  return (
    <Card aria-labelledby="latest-threads-heading">
      <CardHeader>
        <CardTitle id="latest-threads-heading">{c('heading')}</CardTitle>
        <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
          {c('asOf')} <Stamp at={capturedAt} />
        </p>
      </CardHeader>

      {threads.length === 0 ? (
        <Empty className="py-6">
          <EmptyTitle>{c('nothingYet')}</EmptyTitle>
          <EmptyDescription>{c('emptyDescription')}</EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.href} className="flex flex-col gap-0.5 px-4 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href={thread.href}
                    className={`truncate text-sm font-medium text-foreground ${LINK}`}
                  >
                    {thread.title}
                  </a>
                  <span className={`shrink-0 text-xs text-muted-foreground ${NUMERIC}`}>
                    {thread.replyCount.label}{' '}
                    {thread.replyCount.value === 1 ? c('reply.one') : c('reply.other')}
                  </span>
                </div>

                <p className="truncate text-xs text-muted-foreground">
                  <UserRef user={thread.author} className="font-normal" /> {c('in')}{' '}
                  <a href={thread.forum.href} className={MUTED_LINK}>
                    {thread.forum.label}
                  </a>{' '}
                  {c('dot')} <Stamp at={thread.startedAt} />
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
