import type { PostActionsSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn, Separator } from '@meith/ui'

import { BUTTON, isEmptyRegion } from '../shared'

interface Action {
  readonly href: string
  readonly label: string
}

const ACTION = cn(BUTTON, 'h-7 px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground')

export function PostActions({
  actions,
  children,
  copy,
}: PostActionsSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.postActions.${key}`)

  const reader: Action[] = [
    actions.quoteHref === null ? null : { href: actions.quoteHref, label: c('quote') },
    actions.editHref === null ? null : { href: actions.editHref, label: c('edit') },
    actions.historyHref == null ? null : { href: actions.historyHref, label: c('history') },
    actions.rateHref === null ? null : { href: actions.rateHref, label: c('rate') },
    actions.reportHref === null ? null : { href: actions.reportHref, label: c('report') },
  ].filter((action): action is Action => action !== null)

  const staff: Action[] = [
    actions.restoreHref === null ? null : { href: actions.restoreHref, label: c('restore') },
    actions.warnHref === null ? null : { href: actions.warnHref, label: c('warn') },
    actions.moderateHref === null ? null : { href: actions.moderateHref, label: c('moderate') },
  ].filter((action): action is Action => action !== null)

  const extra = isEmptyRegion(children) ? null : children

  if (reader.length === 0 && staff.length === 0 && extra === null) return null

  return (
    <nav
      aria-label={c('postActions')}
      className="flex flex-wrap items-center gap-1 border-t border-border bg-surface px-3 py-1.5 empty:hidden"
    >
      {reader.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {reader.length > 0 && staff.length > 0 && (
        <Separator orientation="vertical" className="mx-1.5" />
      )}

      {staff.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {extra}
    </nav>
  )
}
