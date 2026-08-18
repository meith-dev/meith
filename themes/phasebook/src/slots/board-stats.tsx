import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { count, NUMERIC, Rail, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.boardStats.${key}`)

  return (
    <Rail title={c('title')} titleId="board-stats-heading">
      {computedAt === null ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">{c('notComputed')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-1 px-3 pb-2 text-center">
            {[
              { label: c('threads'), value: threadCount },
              { label: c('posts'), value: postCount },
              { label: c('members'), value: memberCount },
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
                <span>{c('newestMember')}</span>
                <UserRef user={newestMember} className="text-xs" />
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className={NUMERIC}>
              {c('counted')} <Stamp at={computedAt} />
            </span>
          </p>
        </>
      )}
    </Rail>
  )
}
