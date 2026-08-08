import { buttonVariants } from '@meith/ui'
import type { BoardIndexModel } from '@meith/theme-kit'

import { PAGE_BODY } from '../shared'

/**
 * The board index body (F29).
 *
 * A frame around five regions the page fills, in three bands: the communities, a
 * rail beside them, and a footer under both. Every region may be absent —
 * `stats` and `online` are `null` on a board with no rollup, `latest` on a board
 * with no thread index — and absent means *nothing rendered*, not an empty box.
 * A "0 members online" line on a board that keeps no presence is a lie with a
 * number in it.
 *
 * ## The rail is for what moves
 *
 * The newest threads and the newest posts change while somebody is looking at
 * the page — the host refreshes that region on a timer — so they sit beside the
 * community listing where a reader can see them change, rather than under it where
 * nobody is looking.
 *
 * Two columns above `lg`: the communities, and a 20rem rail. Below `lg` the rail
 * becomes panels stacked under the listing, because 20rem of sidebar on a phone
 * is a second page nobody scrolled to. `lg:items-start` is load-bearing rather
 * than tidy — grid items stretch by default, so without it the rail's last card
 * would grow to the height of a fifty-community listing.
 *
 * ## The totals and the online list are the page's footer
 *
 * They were cards under the listing, then cards at the foot of the rail, and
 * they are neither now: they are two lines across the bottom of the page, above
 * the board's own footer bar. A card is a container for something a reader acts
 * on, and these are facts *about* the board — three numbers, a name, and who
 * else is here. As lines they cost one row each instead of two panels, and they
 * read as what they are: the small print under the board.
 *
 * The order is the same argument the two-column version made: who is here now,
 * then how much is here in total. A returning member is checking for the first.
 */
export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  /* `?? null` folds "the host did not send it" and "there was none" together. */
  const rail = (regions.latest ?? null) !== null
  const footer = regions.stats !== null || regions.online !== null

  return (
    <div className={PAGE_BODY}>
      {/*
        F71. Above the communities, because that is where somebody looks first and
        the whole point of an announcement is being read before the board is.
      */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        /*
         * A form, not a link: marking every community read is a state change, and a
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
            Mark all communities read
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">{regions.categories}</div>

        {rail && (
          /*
           * A landmark with a name. A rail of panels is a region a screen
           * reader user should be able to jump to and skip, and an unlabelled
           * `<aside>` on a page that also has `<main>` is a complementary
           * region announced as "complementary".
           */
          <aside aria-label="Board activity" className="flex min-w-0 flex-col gap-4">
            {regions.latest}
          </aside>
        )}
      </div>

      {footer && (
        /*
         * A rule and two lines, not a panel. The border is the whole visual
         * device: it separates the board from the facts about the board, which
         * is the only thing a container was doing here.
         */
        <div className="flex flex-col gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          {regions.online}
          {regions.stats}
        </div>
      )}

      {/* F80's `index.footer` region. Absent when no plugin contributes. */}
      {regions.plugins}
    </div>
  )
}
