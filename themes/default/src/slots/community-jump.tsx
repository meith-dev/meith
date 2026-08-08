import { Label, NativeSelect, buttonVariants } from '@meith/ui'
import type { CommunityJumpModel } from '@meith/theme-kit'

import { PAGE } from '../shared'

/**
 * The community jump box (F27) — MyBB's `<select>` at the foot of every page.
 *
 * ## A form with a button, not a select that navigates
 *
 * The version everyone writes first is `onChange={(e) => location.href = …}`.
 * It is wrong twice, and both wrongs have the same root: **choosing an option is
 * not the same act as committing to it.**
 *
 * A keyboard user opens a `<select>` and arrow-keys down the list. Every
 * keystroke fires `change`. An auto-navigating jump box therefore teleports them
 * to the first community in the list before they have reached the one they wanted,
 * and there is no way back except the back button — which lands them on the same
 * trap. The same code also does nothing at all without JavaScript, which is the
 * board's baseline (R5).
 *
 * So this is a real `method="get"` form with a real submit button. The button is
 * not a fallback for the no-JS case; it is the interaction, and it happens to
 * work everywhere.
 *
 * ## Categories are disabled options
 *
 * A category is a heading, not a destination — jumping to one would land on a
 * page that lists communities the box already lists. `disabled` on an `<option>` is
 * the native way to say "structure, not choice", and screen readers announce it
 * as such. Indentation comes from `depth`, applied here, because the app gives
 * the tree's shape and the theme decides how to show it.
 *
 * ## It sits above the footer, quietly
 *
 * `PageShell` renders this on every page between the body and the footer, so it
 * has to read as chrome rather than as a control the page is offering. Right
 * aligned on a wide screen, full width on a narrow one, and the label is beside
 * the box rather than above it — a two-line form for one `<select>` is a form
 * that looks more important than it is.
 *
 * It carries the footer's `bg-card` for the same reason. On the page's own
 * background it was a third band — content, then a strip holding one select,
 * then the footer — and a reader scanning down the page met two changes of
 * surface where there is one idea. Same fill, one hairline between them: the
 * chrome at the bottom of the page is one block that happens to have a control
 * in its top half.
 */
export function CommunityJump({ action, field, communities, submitLabel, label }: CommunityJumpModel) {
  if (communities.length === 0) return null

  const id = `community-jump-${field}`

  return (
    /*
     * No `mt-auto` here, deliberately, and it was tried.
     *
     * `Shell` is a `min-h-dvh` flex column whose footer claims the slack with
     * `mt-auto`, and the page body claims it with `flex-1`. Adding a second
     * auto margin on this box does not put it above the footer — auto margins
     * are resolved *before* flex-grow, so the two share the free space equally
     * and the jump box ends up stranded in the middle of a short page with a
     * gap under it. The right fix was on the other side: a page whose body is
     * not `flex-1` is a page missing its `<main>` landmark, which is a broken
     * skip link before it is a layout problem.
     */
    <div className="border-t border-border bg-card">
      <form
        method="get"
        action={action}
        className={`${PAGE} flex flex-wrap items-center gap-2 py-3 sm:justify-end`}
      >
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>

        <NativeSelect
          id={id}
          name={field}
          defaultValue={communities.find((community) => community.isSelected)?.value ?? ''}
          className="h-8 w-auto min-w-48 flex-1 text-xs sm:flex-none"
        >
          {communities.map((community) => (
            <option
              key={community.value}
              value={community.value}
              disabled={community.isCategory}
              /*
               * Figure spaces rather than `&nbsp;` or CSS padding: an `<option>`
               * cannot be styled reliably across browsers, and a figure space is
               * a real character that indents without being announced as a word.
               */
              label={`${'  '.repeat(community.depth)}${community.label}`}
            >
              {`${'  '.repeat(community.depth)}${community.label}`}
            </option>
          ))}
        </NativeSelect>

        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
