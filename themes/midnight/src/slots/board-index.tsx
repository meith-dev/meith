import type { BoardIndexModel } from '@meith/theme-kit'

/**
 * The index body.
 *
 * Midnight puts the panels **above** the forum list rather than beside it,
 * which is the classic arrangement and a real difference: the default theme
 * builds a right-hand rail out of the same regions, and the page hands both
 * themes exactly the same nodes. Neither region is invented when it is absent —
 * a "0 online" panel on a board that keeps no presence is a lie with a number
 * in it.
 *
 * The live pair leads, because it is the part that moves. This theme is a log
 * of what is happening; the totals and the online list are the header on that
 * log, not the subject of it.
 */
export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const latest = regions.latest ?? null

  return (
    <div className="flex flex-col gap-3 p-3">
      {latest !== null && <div className="flex flex-col gap-3">{latest}</div>}

      {(regions.online !== null || regions.stats !== null) && (
        <div className="flex flex-col gap-3">
          {regions.online}
          {regions.stats}
        </div>
      )}

      {/*
        F71. Above the forums here too. Midnight puts stats first and the
        announcements after them, which is the ordering choice a theme gets to
        make — what it does not get to do is drop the region.
      */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      <div className="flex flex-col gap-3">{regions.categories}</div>

      {/* F80's `index.footer` region. */}
      {regions.plugins}

      {markAllReadAction !== null && (
        /* A form, not a link: marking every forum read is a state change. */
        <form action={markAllReadAction} method="post">
          <button
            type="submit"
            className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            mark all forums read
          </button>
        </form>
      )}
    </div>
  )
}
