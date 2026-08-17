import type { LatestThreadsModel } from '@meith/theme-kit'
import { Card, CardContent, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { LINK, MICRO, MUTED_LINK, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

export function LatestThreads({ threads, capturedAt }: LatestThreadsModel) {
  return (
    <Card aria-labelledby="latest-threads-heading">
      <PanelHead
        id="latest-threads-heading"
        title="Latest threads"
        aside={
          <span className={MICRO}>
            As of <Stamp at={capturedAt} />
          </span>
        }
      />

      {threads.length === 0 ? (
        <Empty className="py-5">
          <EmptyTitle>Nothing started yet</EmptyTitle>
          <EmptyDescription>The newest threads you can see will appear here.</EmptyDescription>
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
                    {thread.replyCount.toLocaleString('en')}
                  </span>
                </div>

                <p className="truncate text-xs text-muted-foreground">
                  <UserRef user={thread.author} className="font-medium" />
                  {' in '}
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
