import type { PostActionsSlotModel } from '@forum/theme-kit'

/**
 * Per-post controls, as a row of plain links.
 *
 * Links and never buttons with handlers: every one of these is a GET to a page
 * that does the work, so the whole set functions with JavaScript disabled. The
 * model gives `null` for anything this viewer may not do, so there is no
 * permission decision to make here — and a theme must not try to make one.
 */
export function PostActions({ actions }: PostActionsSlotModel) {
  const items = [
    { href: actions.quoteHref, label: 'quote' },
    { href: actions.editHref, label: 'edit' },
    { href: actions.restoreHref, label: 'restore' },
    { href: actions.rateHref, label: 'rate' },
    { href: actions.reportHref, label: 'report' },
    { href: actions.warnHref, label: 'warn' },
    { href: actions.moderateHref, label: 'moderate' },
  ].filter((item): item is { href: string; label: string } => item.href !== null)

  if (items.length === 0) return null

  return (
    <nav aria-label="Post actions" className="flex flex-wrap gap-3 font-mono text-xs">
      {items.map((item) => (
        <a key={item.label} href={item.href} className="text-muted-foreground hover:text-primary">
          {item.label}
        </a>
      ))}
    </nav>
  )
}
