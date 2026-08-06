import type { BoardStatsModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <section aria-labelledby="board-stats-heading" className="border border-border">
      <h2
        id="board-stats-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        Board statistics
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 font-mono text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">threads</dt>
          <dd>{threadCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">posts</dt>
          <dd>{postCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">members</dt>
          <dd>{memberCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">newest</dt>
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
          'not counted yet'
        ) : (
          <>
            counted <time dateTime={computedAt.iso}>{computedAt.label}</time>
          </>
        )}
      </p>
    </section>
  )
}
