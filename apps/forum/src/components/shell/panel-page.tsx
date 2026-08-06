/**
 * One screen inside a control panel: its `<main>`, its measure, and its title.
 *
 * ## The problem this fixes is visible before you read a word
 *
 * Every panel screen used to open with its own container — `mx-auto flex w-full
 * max-w-3xl flex-col gap-8 px-6 py-8` on one, `max-w-4xl` and `gap-6` on the
 * next, `max-w-5xl` on a third — and each of those centred itself in whatever
 * space the rail left over. So moving from Board settings to Forums to the
 * admin log slid the content sideways by a hundred and thirty pixels, twice,
 * for no reason a reader could name. Forty-odd files each held their own answer
 * to a question nobody had asked them.
 *
 * A panel has one measure and the content sits at the left of it, hard against
 * the rail's gutter. Nothing moves between sections, because there is nothing
 * left for a section to decide.
 *
 * ## `wide` is a real need and it is exactly one thing
 *
 * A permission matrix, a log, an attachment table: content that is a grid of
 * columns rather than prose, and that is unreadable squeezed into a reading
 * measure. Those screens say so, and get the full width of the column instead
 * of the reading width. Everything else — a form, a list, a card of settings —
 * is prose-shaped and reads better bounded.
 *
 * ## It is the `<main>`, on purpose
 *
 * The board's skip link points at `#board-content`, and the member's and the
 * moderator's panels sit inside the board's chrome where the page has always
 * owned that landmark. The ACP's layout used to own it instead, which meant
 * the ACP's pages and the board's pages disagreed about which element was the
 * page. Now the rule is the same everywhere: the panel shell is the rail, and
 * the page is the `<main>`, so the skip link lands on the content rather than
 * on the dozen links in front of it.
 *
 * `tabIndex={-1}` so that landing there from the skip link actually moves
 * focus; a `<main>` is not focusable on its own.
 */

import { cn } from "@meith/ui";

export interface PanelPageProps {
  /** The screen's `<h1>`. */
  readonly title: React.ReactNode;
  /**
   * The section this screen hangs off, above the title.
   *
   * Only for screens that are *inside* a section rather than being one —
   * Mass mail under Users, Announcements under Content, one group's page. The
   * rail marks the section too, but the rail is a `<details>` on a phone and
   * folded shut; this is the way back that is always on screen.
   */
  readonly back?: { readonly href: string; readonly label: string };
  /** One line under it saying what the screen is for, where that is not obvious. */
  readonly lede?: React.ReactNode;
  /**
   * A second, smaller line of *facts about the record* — post counts, when a
   * theme was last changed, whether an address is verified.
   *
   * Separate from `lede` rather than folded into it because they answer
   * different questions: the lede says what this screen is, and this says what
   * the thing on it currently is. Only the record screens have one.
   */
  readonly meta?: React.ReactNode;
  /** Controls that belong to the screen as a whole, on the title's line. */
  readonly actions?: React.ReactNode;
  /**
   * `reading` bounds the column for prose and forms; `wide` gives a table or a
   * matrix the whole of it. There is no third option and there should not be.
   */
  readonly width?: "reading" | "wide";
  /** The gap between the header and the body, and between the body's own children. */
  readonly gap?: "normal" | "loose";
  readonly children: React.ReactNode;
}

export function PanelPage({
  title,
  back,
  lede,
  meta,
  actions,
  width = "reading",
  gap = "normal",
  children,
}: PanelPageProps) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={cn(
        "flex w-full flex-col px-6 py-8",
        width === "wide" ? "max-w-none" : "max-w-4xl",
        gap === "loose" ? "gap-8" : "gap-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          {back !== undefined && (
            <a
              href={back.href}
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ← {back.label}
            </a>
          )}
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {lede !== undefined && (
            <p className="text-sm text-muted-foreground">{lede}</p>
          )}
          {meta !== undefined && (
            <p className="text-xs text-muted-foreground">{meta}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children}
    </main>
  );
}

/**
 * A titled block within a screen.
 *
 * The panels had four spellings of this — a bare `<h2>` over a list, a
 * `<section>` with a border and a heading inside it, a `Card` with a
 * `CardHeader`, and a `<section className="flex flex-col gap-3">` — and which
 * one a screen used was a matter of when it was written. The heading level and
 * the labelled region are the parts that have to be right every time, so they
 * are here rather than remembered.
 */
export function PanelSection({
  title,
  description,
  actions,
  id,
  children,
}: {
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  /** The heading's id, so the `<section>` can be labelled by it. */
  readonly id: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id={id}
            className="font-serif text-lg font-semibold text-foreground"
          >
            {title}
          </h2>
          {description !== undefined && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children}
    </section>
  );
}
