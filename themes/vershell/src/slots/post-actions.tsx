import type { PostActionsSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { isEmptyRegion, LABEL, TOUCH } from '../shared'

interface Action {
  readonly href: string
  readonly label: string
}

const ACTION = `${LABEL} inline-flex items-center py-2 transition-colors hover:text-foreground ${TOUCH}`

export function PostActions({
  actions,
  children,
  copy,
}: PostActionsSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.postActions.${key}`)

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
    <nav aria-label={c('nav')} className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {reader.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {reader.length > 0 && staff.length > 0 && (
        <span aria-hidden="true" className="h-3.5 w-px bg-border" />
      )}

      {staff.map((action) => (
        <a key={action.href} href={action.href} className={ACTION}>
          {action.label}
        </a>
      ))}

      {extra !== null && (
        <span className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1">{extra}</span>
      )}
    </nav>
  )
}
