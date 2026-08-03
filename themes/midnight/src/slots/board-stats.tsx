import type { BoardStatsModel } from '@forum/theme-kit'

/**
 * Board totals, as a definition list rather than a sentence.
 *
 * `computedAt` is rendered, not dropped. The totals are a rollup (F75), and
 * "counted ten minutes ago" is the difference between a number that is stale and
 * one that is wrong; `null` means the rollup has not run, which is said in words
 * rather than shown as three convincing zeroes.
 */
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
            ) : newestMember.profileHref === null ? (
              newestMember.username
            ) : (
              <a href={newestMember.profileHref} className="text-primary hover:underline">
                {newestMember.username}
              </a>
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
