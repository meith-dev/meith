import { Card, CardContent, CardHeader, CardTitle, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'
import type { LatestThreadsModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

/**
 * The newest threads on the board.
 *
 * A sidebar panel, which decides everything about how it is written: each row
 * is a title and one line of context, the title truncates rather than wraps to
 * three lines, and the count is a number rather than "3 replies" because five
 * rows of prose in a 20rem column is a wall.
 *
 * ## `capturedAt` is in the header, not the footer
 *
 * `BoardStats` puts "Counted <time>" in its footer, and that is right for a
 * number that is old: a caveat belongs after the thing it qualifies. This is
 * the opposite claim — the list is *current*, and it refreshes itself while
 * somebody watches — so it reads as a subtitle, next to the heading, where a
 * reader looking for "is this thing live" already is.
 *
 * ## Nothing here knows it refreshes
 *
 * The app wraps this panel in an island and swaps in a newer render of *this
 * same component* every minute. That is deliberately invisible from here: a
 * slot that knew it was live would have to hold state, and a stateful slot is a
 * client component shipped to every reader of the index.
 */
export function LatestThreads({ threads, capturedAt }: LatestThreadsModel) {
  return (
    <Card aria-labelledby="latest-threads-heading">
      <CardHeader>
        <CardTitle id="latest-threads-heading">Latest threads</CardTitle>
        <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
          As of <Stamp at={capturedAt} />
        </p>
      </CardHeader>

      {threads.length === 0 ? (
        <Empty className="py-6">
          <EmptyTitle>Nothing started yet</EmptyTitle>
          <EmptyDescription>
            The newest threads you can see will appear here.
          </EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.href} className="flex flex-col gap-0.5 px-4 py-2">
                {/*
                  The count is `shrink-0` and the title is not, so a long title
                  is what gives way. The other way round, a rail this narrow
                  truncates a two-word count off the end of every row — which
                  reads as a rendering bug rather than as a column that is full.
                */}
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href={thread.href}
                    className={`truncate text-sm font-medium text-foreground ${LINK}`}
                  >
                    {thread.title}
                  </a>
                  <span className={`shrink-0 text-xs text-muted-foreground ${NUMERIC}`}>
                    {thread.replyCount.toLocaleString('en')}{' '}
                    {thread.replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                </div>

                <p className="truncate text-xs text-muted-foreground">
                  <UserRef user={thread.author} className="font-normal" />
                  {' in '}
                  <a href={thread.community.href} className={MUTED_LINK}>
                    {thread.community.label}
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
