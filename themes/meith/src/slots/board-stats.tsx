import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { EDITORIAL_RULE, Label, META, NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.boardStats.${key}`)

  return (
    <section aria-labelledby="board-stats-heading" className={`${EDITORIAL_RULE} pt-4`}>
      <Label as="h2" id="board-stats-heading">
        {c('heading')}
      </Label>

      {computedAt === null ? (
        <p className={`${META} mt-4`}>{c('notComputed')}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-x-4">
            {[
              { label: c('threads'), value: threadCount },
              { label: c('posts'), value: postCount },
              { label: c('members'), value: memberCount },
            ].map((figure) => (
              <div key={figure.label} className="min-w-0">
                <dd
                  className={`${NUMERIC} truncate text-[1.75rem] leading-none tracking-[-0.02em] text-primary`}
                >
                  {figure.value.label}
                </dd>
                <Label as="dt" className="mt-2">
                  {figure.label}
                </Label>
              </div>
            ))}
          </dl>

          <p className={`${META} mt-5 flex flex-col gap-0.5`}>
            {newestMember !== null && (
              <span>
                {c('newestMember')} <UserRef user={newestMember} />
              </span>
            )}
            <span>
              {c('counted')} <Stamp at={computedAt} />
            </span>
          </p>
        </>
      )}
    </section>
  )
}
