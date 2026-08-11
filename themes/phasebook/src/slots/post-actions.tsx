import type { PostActionsSlotModel } from '@meith/theme-kit'

interface Action {
  readonly href: string
  readonly label: string
}

const ACTION =
  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ' +
  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

export function PostActions({ actions, children }: PostActionsSlotModel) {
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

  if (reader.length === 0 && staff.length === 0 && children === undefined) return null

  return (
    <nav aria-label="Post actions" className="flex flex-wrap items-center gap-1">
      {reader.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {staff.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {children !== undefined && <span className="ms-auto empty:hidden">{children}</span>}
    </nav>
  )
}
