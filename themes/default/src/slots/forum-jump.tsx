import type { ForumJumpModel } from '@meith/theme-kit'

/**
 * The forum jump box (F27) — MyBB's `<select>` at the foot of every page.
 *
 * ## A form with a button, not a select that navigates
 *
 * The version everyone writes first is `onChange={(e) => location.href = …}`.
 * It is wrong twice, and both wrongs have the same root: **choosing an option is
 * not the same act as committing to it.**
 *
 * A keyboard user opens a `<select>` and arrow-keys down the list. Every
 * keystroke fires `change`. An auto-navigating jump box therefore teleports them
 * to the first forum in the list before they have reached the one they wanted,
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
 * page that lists forums the box already lists. `disabled` on an `<option>` is
 * the native way to say "structure, not choice", and screen readers announce it
 * as such. Indentation comes from `depth`, applied here, because the app gives
 * the tree's shape and the theme decides how to show it.
 */
export function ForumJump({ action, field, forums, submitLabel, label }: ForumJumpModel) {
  if (forums.length === 0) return null

  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <select
          name={field}
          defaultValue={forums.find((forum) => forum.isSelected)?.value ?? ''}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {forums.map((forum) => (
            <option
              key={forum.value}
              value={forum.value}
              disabled={forum.isCategory}
              /*
               * Figure spaces rather than `&nbsp;` or CSS padding: an `<option>`
               * cannot be styled reliably across browsers, and a figure space is
               * a real character that indents without being announced as a word.
               */
              label={`${'  '.repeat(forum.depth)}${forum.label}`}
            >
              {`${'  '.repeat(forum.depth)}${forum.label}`}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {submitLabel}
      </button>
    </form>
  )
}
