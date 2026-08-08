/**
 * The arrangement every control panel on the board is laid out in.
 *
 * ## Why one component rather than three layouts that look similar
 *
 * They were three layouts that looked similar, and then they were not. The ACP
 * grew a sticky rail; the member's panel copied its arrangement by hand a
 * feature later, with a different maximum width, a different rail width and a
 * different sticky offset; the ModCP got neither and made do with a row of
 * pills that never said which one you were on. Three panels that a board's
 * staff move between all day were three different shapes to learn, and none of
 * the differences was a decision anybody had made.
 *
 * So the shape is here, once. What a panel still decides for itself is its
 * tree, whether it sits inside the board's chrome, and which of its siblings it
 * can offer a way into.
 *
 * ## The two offsets are the only real difference
 *
 * The ACP replaces the board's chrome with its own sticky 56px header, so its
 * rail sticks below that. The other two sit inside the board, whose header
 * scrolls away, so theirs sticks to the top of the viewport with a little air.
 * That is `railOffset`, and it is the whole of the divergence.
 *
 * `self-start` is what makes `sticky` work in a flex row at all — a stretched
 * item is already as tall as the row and has nowhere to stick to.
 *
 * `flex-1` on the row is load-bearing and easy to lose: the board's `Shell` is
 * a `min-h-dvh` column whose footer claims the slack with `mt-auto`, and the
 * page body claims it with `flex-1`. Interposing a wrapper without one breaks
 * that chain — the footer takes everything and the jump box above it strands
 * itself under a short page with a band of empty background beneath.
 *
 * ## No horizontal padding on the row
 *
 * The rail carries its own and every page under this shell carries its own
 * through `PanelPage`, so a gutter here would be a second one. The gap between
 * the rail and the content is the content's left padding.
 */

import { PanelLinks, type PanelLink } from "./panel-links";

export interface PanelShellProps {
  /** The panel's rail — an `AdminNav`, `UserCpNav` or `ModCpNav`. */
  readonly nav: React.ReactNode;
  /**
   * The other panels this viewer may open, under a rule at the foot of the
   * rail. Empty for a viewer who holds only this one, which is most of them.
   */
  readonly links?: readonly PanelLink[];
  /**
   * Where the rail sticks. `board` clears the top of the viewport; `panel`
   * clears the ACP's own sticky header.
   */
  readonly railOffset?: "board" | "panel";
  readonly children: React.ReactNode;
}

export function PanelShell({
  nav,
  links = [],
  railOffset = "board",
  children,
}: PanelShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside
        className={
          railOffset === "panel"
            ? "flex flex-col gap-4 px-6 pt-6 lg:sticky lg:top-14 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0"
            : "flex flex-col gap-4 px-6 pt-6 lg:sticky lg:top-6 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0"
        }
      >
        {nav}
        {links.length > 0 && <PanelLinks links={links} />}
      </aside>

      {/* `min-w-0`: without it a wide table inside a page stretches the row. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
