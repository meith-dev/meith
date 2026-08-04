import { buttonVariants } from '@meith/ui'
import type { BoardIndexModel } from '@meith/theme-kit'

import { PAGE_BODY } from '../shared'

/**
 * The board index body (F29).
 *
 * A frame around four regions the page fills. `stats` and `online` are `null` on
 * a board with no rollup yet — rendering nothing rather than an empty box,
 * because a "0 members online" panel on a board with no online tracking is a lie
 * with a number in it.
 *
 * ## The two panels sit side by side
 *
 * They used to be stacked, which on a wide screen put the board's totals below
 * the fold on a page whose whole job is to fit. They are both short, they are
 * both summaries, and neither is more important than the other — which is
 * exactly the case a two-column grid is for. Below `lg` they stack again, since
 * two 40%-width panels on a phone are two unreadable panels.
 *
 * Order matters at both widths: who is here now, then how much is here in total.
 * A board's liveness is the thing a returning member is checking for.
 */
export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const hasPanels = regions.stats !== null || regions.online !== null

  return (
    <div className={PAGE_BODY}>
      {/*
        F71. Above the forums, because that is where somebody looks first and
        the whole point of an announcement is being read before the board is.
      */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        /*
         * A form, not a link: marking every forum read is a state change, and a
         * GET that mutates gets fired by every prefetcher and link scanner that
         * touches the page. It is a plain submit button so it works without
         * JavaScript (R5).
         *
         * Above the listing rather than below it, and quiet: it is a control
         * for somebody who has already decided, so it needs to be findable
         * rather than prominent.
         */
        <form action={markAllReadAction} method="post" className="self-end">
          <button type="submit" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Mark all forums read
          </button>
        </form>
      )}

      <div className="flex flex-col gap-4">{regions.categories}</div>

      {hasPanels && (
        <div className="grid gap-4 lg:grid-cols-2">
          {regions.online}
          {regions.stats}
        </div>
      )}

      {/* F80's `index.footer` region. Absent when no plugin contributes. */}
      {regions.plugins}
    </div>
  )
}
