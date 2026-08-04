import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'
import type { BoardStatsModel } from '@meith/theme-kit'

import { NUMERIC, Stamp, UserRef } from '../shared'

/**
 * The board's totals (F75).
 *
 * Two decisions here rather than styling.
 *
 * **The panel says when the numbers were computed.** They are a rollup, not a
 * live count — the member count is a count of `users`, and the index is the
 * most-requested page on the board. A number that is ten minutes old and says
 * so is honest; the same number presented as "now" is wrong. It sits in the
 * card's footer, which is where a caveat belongs: readable, not shouted.
 *
 * **Before the first rollup it says so rather than showing zeroes.** Three
 * convincing zeroes on a board with content is the worst of the three possible
 * outputs, because nobody doubts it — and on a board that genuinely has nothing
 * yet it is indistinguishable from a rollup that has failed for a week.
 *
 * The figures are a `<dl>` and the numbers lead: somebody reading this panel is
 * comparing three quantities, and putting the word first makes them read three
 * sentences instead.
 */
export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <Card aria-labelledby="board-stats-heading">
      <CardHeader>
        <CardTitle id="board-stats-heading">Board statistics</CardTitle>
      </CardHeader>

      {computedAt === null ? (
        <Empty className="py-8">
          <EmptyTitle>Not counted yet</EmptyTitle>
          <EmptyDescription>
            The board totals are rolled up on a schedule, and the first run has not happened.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: 'Threads', value: threadCount },
                { label: 'Posts', value: postCount },
                { label: 'Members', value: memberCount },
              ].map((figure) => (
                <div key={figure.label}>
                  <dd className={`text-xl font-semibold text-foreground ${NUMERIC}`}>
                    {figure.value.toLocaleString('en')}
                  </dd>
                  <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                </div>
              ))}
            </dl>

            {newestMember !== null && (
              <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                Newest member: <UserRef user={newestMember} className="text-foreground" />
              </p>
            )}
          </CardContent>

          <CardFooter>
            <span>
              Counted <Stamp at={computedAt} />
            </span>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
