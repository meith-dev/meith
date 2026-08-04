import type { BoardIndexModel } from '@meith/theme-kit'

/**
 * The board index body (F29).
 *
 * A frame around three regions the page fills. `stats` and `online` are `null`
 * until F75 — rendering nothing rather than an empty box, because a "0 members
 * online" panel on a board with no online tracking is a lie with a number in it.
 */
export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      {markAllReadAction !== null && (
        /*
         * A form, not a link: marking every forum read is a state change, and a
         * GET that mutates gets fired by every prefetcher and link scanner that
         * touches the page. It is a plain submit button so it works without
         * JavaScript (R5).
         */
        <form action={markAllReadAction} method="post" className="self-end">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Mark all forums read
          </button>
        </form>
      )}

      {/*
        F71. Above the forums, because that is where somebody looks first and
        the whole point of an announcement is being read before the board is.
      */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      <div className="flex flex-col gap-6">{regions.categories}</div>

      {(regions.stats !== null || regions.online !== null) && (
        <div className="flex flex-col gap-4">
          {regions.online}
          {regions.stats}
        </div>
      )}

      {/* F80's `index.footer` region. Absent when no plugin contributes. */}
      {regions.plugins}
    </div>
  )
}
