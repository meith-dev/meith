import type { PostActionsSlotModel } from '@meith/theme-kit'
import { buttonVariants, Separator } from '@meith/ui'

interface Action {
  readonly href: string
  readonly label: string
}

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

      {children !== undefined && <span className="ms-auto empty:hidden">{children}</span>}
    </nav>
  )
}
