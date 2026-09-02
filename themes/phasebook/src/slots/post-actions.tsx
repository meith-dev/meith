import type { PostActionsSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { isEmptyRegion } from '../shared'

interface Action {
  readonly href: string
  readonly label: string
}

const ACTION =
  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ' +
  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

export function PostActions({
  actions,
  children,
  copy,
}: PostActionsSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.postActions.${key}`)

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
    <nav aria-label={c('ariaLabel')} className="flex flex-wrap items-center gap-1">
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

      {extra !== null && <span className="ms-auto">{extra}</span>}
    </nav>
  )
}
