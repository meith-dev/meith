import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MICRO, NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.boardStats.${key}`)

  return (
    <section
      aria-labelledby="board-stats-heading"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <h2 id="board-stats-heading" className={MICRO}>
        {c('heading')}
      </h2>

      {computedAt === null ? (
        <span>{c('notComputed')}</span>
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
              {c(figure.label)}
            </span>
          ))}

          {newestMember !== null && (
            <span>
              {c('newest')} <UserRef user={newestMember} className="text-foreground" />
            </span>
          )}

          <span className={`ms-auto ${NUMERIC}`}>
            {c('counted')} <Stamp at={computedAt} />
          </span>
        </>
      )}
    </section>
  )
}
