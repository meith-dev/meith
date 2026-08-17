import type { BoardStatsModel } from '@meith/theme-kit'

import { count, NUMERIC, Rail, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <Rail title="Board stats" titleId="board-stats-heading">
      {computedAt === null ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          The board&rsquo;s totals are rolled up on a schedule, and the first run has not happened.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-1 px-3 pb-2 text-center">
            {[
              { label: 'Threads', value: threadCount },
              { label: 'Posts', value: postCount },
              { label: 'Members', value: memberCount },
            ].map((figure) => (
              <div key={figure.label} className="rounded-lg bg-secondary/60 px-1 py-2">
                <dd className={`text-base font-bold text-foreground ${NUMERIC}`}>
                  {count(figure.value)}
                </dd>
                <dt className="text-xs text-muted-foreground">{figure.label}</dt>
              </div>
            ))}
          </dl>

          <p className="flex flex-wrap items-center gap-x-1.5 px-3 pb-3 text-xs text-muted-foreground">
            {newestMember !== null && (
              <>
                <span>Newest member</span>
                <UserRef user={newestMember} className="text-xs" />
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className={NUMERIC}>
              Counted <Stamp at={computedAt} />
            </span>
          </p>
        </>
      )}
    </Rail>
  )
}
