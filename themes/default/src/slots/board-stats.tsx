import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.boardStats.${key}`)

  return (
    <section
      aria-labelledby="board-stats-heading"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <h2 id="board-stats-heading" className="sr-only">
        {c('heading')}
      </h2>

      {computedAt === null ? (
        <span>{c('notComputed')}</span>
      ) : (
        <>
          {[
            { label: c('threads'), value: threadCount },
            { label: c('posts'), value: postCount },
            { label: c('members'), value: memberCount },
          ].map((figure) => (
            <span key={figure.label}>
              <span className={`font-medium text-foreground ${NUMERIC}`}>{figure.value.label}</span>{' '}
              {figure.label}
            </span>
          ))}

          {newestMember !== null && (
            <span>
              {c('newestMember')} <UserRef user={newestMember} className="text-foreground" />
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
