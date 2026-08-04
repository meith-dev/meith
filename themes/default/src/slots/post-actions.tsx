import { Separator, buttonVariants } from '@meith/ui'
import type { PostActionsSlotModel } from '@meith/theme-kit'

/**
 * Per-post controls (F31).
 *
 * Links and forms, never buttons with handlers — the registry declares this slot
 * `server`, and paging, quoting and reporting all have to work with JavaScript
 * disabled (R5). They look like buttons because they are the only interactive
 * things in a post footer and a bare row of underlined words at 11px is a set of
 * targets nobody can hit on a phone; `buttonVariants` on an `<a>` is exactly the
 * case that recipe is split out of `@meith/ui/button` for.
 *
 * ## Reader actions and moderator actions are separated
 *
 * Quote, edit and report are things anybody might do to a post they are reading.
 * Warn, restore and moderate are things done *to a member*, and they appear only
 * for staff. Running all seven into one row makes a moderator hunt for "quote"
 * among their own tools and — worse — puts "warn" one pixel from "report", which
 * are very different acts with adjacent hit targets.
 *
 * So they are two groups with a rule between them, and the rule is only rendered
 * when both sides exist. The separator is decorative: a screen reader gets the
 * grouping from the nav's label and the reading order, not from an announcement
 * of the word "separator" in the middle of a list of links.
 */

interface Action {
  readonly href: string
  readonly label: string
}

export function PostActions({ actions }: PostActionsSlotModel) {
  const reader: Action[] = [
    actions.quoteHref === null ? null : { href: actions.quoteHref, label: 'Quote' },
    actions.editHref === null ? null : { href: actions.editHref, label: 'Edit' },
    actions.rateHref === null ? null : { href: actions.rateHref, label: 'Rate' },
    actions.reportHref === null ? null : { href: actions.reportHref, label: 'Report' },
  ].filter((action): action is Action => action !== null)

  const staff: Action[] = [
    actions.restoreHref === null ? null : { href: actions.restoreHref, label: 'Restore' },
    actions.warnHref === null ? null : { href: actions.warnHref, label: 'Warn' },
    actions.moderateHref === null ? null : { href: actions.moderateHref, label: 'Moderate' },
  ].filter((action): action is Action => action !== null)

  if (reader.length === 0 && staff.length === 0) return null

  return (
    <nav aria-label="Post actions" className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {reader.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {action.label}
        </a>
      ))}

      {reader.length > 0 && staff.length > 0 && (
        <Separator orientation="vertical" className="mx-1.5" />
      )}

      {staff.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {action.label}
        </a>
      ))}
    </nav>
  )
}
