import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.boardStats.${key}`)

  return (
    <section aria-labelledby="board-stats-heading" className="border border-border">
      <h2
        id="board-stats-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        {c('heading')}
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 font-mono text-xs md:grid-cols-4 lg:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{c('threads')}</dt>
          <dd>{threadCount.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{c('posts')}</dt>
          <dd>{postCount.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{c('members')}</dt>
          <dd>{memberCount.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{c('newest')}</dt>
          <dd>
            {newestMember === null ? (
              '—'
            ) : (
              <UserRef user={newestMember} className="text-primary hover:underline" />
            )}
          </dd>
        </div>
      </dl>
      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        {computedAt === null ? (
          c('notCounted')
        ) : (
          <>
            {c('counted')} <time dateTime={computedAt.iso}>{computedAt.label}</time>
          </>
        )}
      </p>
    </section>
  )
}
