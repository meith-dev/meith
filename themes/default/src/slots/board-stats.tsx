import type { BoardStatsModel } from '@meith/theme-kit'

import { NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <section
      aria-labelledby="board-stats-heading"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <h2 id="board-stats-heading" className="sr-only">
        Board statistics
      </h2>

      {computedAt === null ? (
        <span>
          The board&rsquo;s totals are rolled up on a schedule, and the first run has not happened.
        </span>
      ) : (
        <>
          {[
            { label: 'threads', value: threadCount },
            { label: 'posts', value: postCount },
            { label: 'members', value: memberCount },
          ].map((figure) => (
            <span key={figure.label}>
              <span className={`font-medium text-foreground ${NUMERIC}`}>{figure.value.label}</span>{' '}
              {figure.label}
            </span>
          ))}

          {newestMember !== null && (
            <span>
              newest member <UserRef user={newestMember} className="text-foreground" />
            </span>
          )}

          <span className={`ms-auto ${NUMERIC}`}>
            Counted <Stamp at={computedAt} />
          </span>
        </>
      )}
    </section>
  )
}
