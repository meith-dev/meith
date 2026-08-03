import type { BoardStatsModel } from '@forum/theme-kit'

/**
 * The board's totals (F75).
 *
 * Two decisions here rather than styling.
 *
 * **The panel says when the numbers were computed.** They are a rollup, not a
 * live count — the member count is a count of `users`, and the index is the
 * most-requested page on the board. A number that is ten minutes old and says
 * so is honest; the same number presented as "now" is wrong.
 *
 * **Before the first rollup it says so rather than showing zeroes.** Three
 * convincing zeroes on a board with content is the worst of the three possible
 * outputs, because nobody doubts it.
 */
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
      className="rounded-lg border border-border p-4"
    >
      <h2 id="board-stats-heading" className="font-serif text-lg font-semibold">
        Board statistics
      </h2>

      {computedAt === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Not counted yet — the board totals are rolled up on a schedule and the
          first run has not happened.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {threadCount.toLocaleString()} threads · {postCount.toLocaleString()} posts ·{' '}
            {memberCount.toLocaleString()} members
          </p>

          {newestMember !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              Newest member:{' '}
              {newestMember.profileHref === null ? (
                newestMember.username
              ) : (
                <a href={newestMember.profileHref} className="text-primary hover:underline">
                  {newestMember.username}
                </a>
              )}
            </p>
          )}

          <p className="mt-1 text-xs text-muted-foreground">
            Counted <time dateTime={computedAt.iso}>{computedAt.label}</time>.
          </p>
        </>
      )}
    </section>
  )
}
