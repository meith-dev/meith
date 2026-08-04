/**
 * F57 — the member control panel's shell.
 *
 * ## Why a component and not one layout
 *
 * The panel's sections live in four route trees: `/usercp`, `/messages`,
 * `/notifications` and `/subscriptions`. They are not being merged — each has
 * its own URL, is linked from e-mails and from the user panel, and moving them
 * would break bookmarks for a tidier file tree, which is the wrong trade.
 *
 * So each of those segments has a layout, and each layout is this component.
 * A rail that vanished the moment you opened your inbox would be worse than no
 * rail: it would teach a member that the panel is somewhere they leave.
 *
 * ## It is not the ACP's shell, and should not be
 *
 * The ACP replaces the board's chrome entirely, because it is a different
 * surface with different authority. This one sits *inside* the board — same
 * header, same footer, same theme — because it is the member's own corner of
 * the board rather than somewhere else. What it borrows is the arrangement:
 * sticky rail on the left from `lg` up, a `<details>` above the content below
 * that, and the section you are in marked in both.
 *
 * The page keeps its own `<main id="board-content">`. This wraps it in a plain
 * `<div>` rather than adding a second landmark, so the skip link still lands on
 * the page's content and not on the rail that precedes it.
 *
 * `flex-1` on the row is load-bearing and easy to lose: `Shell` is a
 * `min-h-dvh` column whose footer claims the slack with `mt-auto`, and the page
 * body claims it with `flex-1`. Interposing a wrapper without one breaks that
 * chain — the footer takes everything and the jump box above it strands itself
 * under a short page with a band of empty background beneath. See the note in
 * the `ForumJump` slot, which is the other half of the same arrangement.
 */

import { UserCpNav } from './usercp-nav'

export function UserCpShell({ children }: { children: React.ReactNode }) {
  return (
    /*
     * No horizontal padding on the row: the rail carries its own and every
     * page under this shell already carries its own, so a gutter here would be
     * a second one. The gap between the rail and the content is the content's
     * left padding, which is the same arrangement the ACP's shell uses.
     */
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      {/*
        `self-start` is what makes `sticky` work in a flex row — a stretched
        item is already as tall as the row and has nowhere to stick to.
      */}
      <aside className="px-6 pt-6 lg:sticky lg:top-6 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0">
        <UserCpNav />
      </aside>

      {/* `min-w-0`: without it a wide table inside a page stretches the row. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
