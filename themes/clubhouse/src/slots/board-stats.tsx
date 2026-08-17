import type { BoardStatsModel } from '@meith/theme-kit'

import { MICRO, NUMERIC, Stamp, UserRef } from '../shared'

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
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <h2 id="board-stats-heading" className={MICRO}>
        Club record
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
              <span className={`font-semibold text-foreground ${NUMERIC}`}>
                {figure.value.label}
              </span>{' '}
              {figure.label}
            </span>
          ))}

          {newestMember !== null && (
            <span>
              newest <UserRef user={newestMember} className="text-foreground" />
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
