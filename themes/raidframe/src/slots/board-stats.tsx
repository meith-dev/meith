import type { BoardStatsModel } from '@meith/theme-kit'

import { Frame, MICRO, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-surface px-2 py-1.5">
      <dt className={MICRO}>{label}</dt>
      <dd className={`${NUMERIC} text-lg leading-tight font-semibold text-foreground`}>{value}</dd>
    </div>
  )
}

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <Frame aria-labelledby="board-stats-heading">
      <PanelHead id="board-stats-heading" title="Board statistics" />

      <dl className="grid grid-cols-3 gap-1.5 px-3 py-3">
        <Stat label="threads" value={threadCount} />
        <Stat label="posts" value={postCount} />
        <Stat label="members" value={memberCount} />
      </dl>

      <p className={`${MICRO} border-t border-border px-3 py-2 normal-case`}>
        <span className="uppercase">newest member</span>
        {': '}
        {newestMember === null ? (
          '—'
        ) : (
          <UserRef user={newestMember} className="text-primary hover:underline" />
        )}
      </p>

      <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
        {computedAt === null ? (
          <span className="uppercase">not counted yet</span>
        ) : (
          <>
            <span className="uppercase">counted</span> <Stamp at={computedAt} />
          </>
        )}
      </p>
    </Frame>
  )
}
