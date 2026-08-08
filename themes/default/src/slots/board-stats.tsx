import type { BoardStatsModel } from '@meith/theme-kit'

import { NUMERIC, Stamp, UserRef } from '../shared'

/**
 * The board's totals (F75).
 *
 * ## It is a line, not a panel
 *
 * This was a card with a three-column `<dl>` in it, sitting under the forum
 * listing beside the online list. Both have moved to the foot of the index,
 * where they belong: they are facts *about* the board rather than things to do
 * on it, and a card is a container for something a reader acts on. Three
 * numbers and a name are a sentence, and a sentence in a footer is one line
 * that costs no vertical space on the page it summarises.
 *
 * The heading survives as `sr-only`. A visible "Board statistics" title above
 * one line of text is a label longer than the thing it labels — but a region
 * with no accessible name is one a screen-reader user meets as an unannounced
 * run of numbers, so the name stays and only its pixels go.
 *
 * ## The two decisions that did not change with the layout
 *
 * **The panel says when the numbers were computed.** They are a rollup, not a
 * live count — the member count is a count of `users`, and the index is the
 * most-requested page on the board. A number that is ten minutes old and says
 * so is honest; the same number presented as "now" is wrong.
 *
 * **Before the first rollup it says so rather than showing zeroes.** Three
 * convincing zeroes on a board with content is the worst of the three possible
 * outputs, because nobody doubts it — and on a board that genuinely has nothing
 * yet it is indistinguishable from a rollup that has failed for a week.
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
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <h2 id="board-stats-heading" className="sr-only">
        Board statistics
      </h2>

      {computedAt === null ? (
        <span>The board&rsquo;s totals are rolled up on a schedule, and the first run has not happened.</span>
      ) : (
        <>
          {[
            { label: 'threads', value: threadCount },
            { label: 'posts', value: postCount },
            { label: 'members', value: memberCount },
          ].map((figure) => (
            <span key={figure.label}>
              <span className={`font-medium text-foreground ${NUMERIC}`}>
                {figure.value.toLocaleString('en')}
              </span>{' '}
              {figure.label}
            </span>
          ))}

          {newestMember !== null && (
            <span>
              newest member <UserRef user={newestMember} className="text-foreground" />
            </span>
          )}

          <span className={`ms-auto ${NUMERIC}`}>
            Counted <Stamp at={computedAt} />
          </span>
        </>
      )}
    </section>
  )
}
