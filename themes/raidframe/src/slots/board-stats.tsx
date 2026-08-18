import type { BoardStatsModel, CountModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Frame, MICRO, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

function Stat({ label, value }: { label: string; value: CountModel }) {
  return (
    <div className="border border-border bg-surface px-2 py-1.5">
      <dt className={MICRO}>{label}</dt>
      <dd className={`${NUMERIC} text-lg leading-tight font-semibold text-foreground`}>
        {value.label}
      </dd>
    </div>
  )
}

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.boardStats.${key}`)

  return (
    <Frame aria-labelledby="board-stats-heading">
      <PanelHead id="board-stats-heading" title={c('heading')} />

      <dl className="grid grid-cols-3 gap-1.5 px-3 py-3">
        <Stat label={c('threads')} value={threadCount} />
        <Stat label={c('posts')} value={postCount} />
        <Stat label={c('members')} value={memberCount} />
      </dl>

      <p className={`${MICRO} border-t border-border px-3 py-2 normal-case`}>
        <span className="uppercase">{c('newestMember')}</span>
        {': '}
        {newestMember === null ? (
          c('none')
        ) : (
          <UserRef user={newestMember} className="text-primary hover:underline" />
        )}
      </p>

      <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
        {computedAt === null ? (
          <span className="uppercase">{c('notCountedYet')}</span>
        ) : (
          <>
            <span className="uppercase">{c('counted')}</span> <Stamp at={computedAt} />
          </>
        )}
      </p>
    </Frame>
  )
}
