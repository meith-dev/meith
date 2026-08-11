import type { PostActionsSlotModel } from '@meith/theme-kit'

interface Action {
  readonly href: string
  readonly label: string
}

const ACTION =
  'inline-flex h-7 items-center rounded-sm px-2 text-xs font-medium text-muted-foreground ' +
  'transition-colors hover:bg-secondary hover:text-foreground'

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
    <nav aria-label="Post actions" className="flex flex-wrap items-center gap-0.5">
      {reader.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {reader.length > 0 && staff.length > 0 && (
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      )}

      {staff.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {children !== undefined && <span className="ms-auto empty:hidden">{children}</span>}
    </nav>
  )
}
