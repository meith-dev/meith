import type { PostActionsSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { isEmptyRegion } from '../shared'

const ACTION =
  'font-mono text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary'

export function PostActions({
  actions,
  children,
  copy,
}: PostActionsSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.postActions.${key}`)

  const items = [
    { href: actions.quoteHref, label: c('quote') },
    { href: actions.editHref, label: c('edit') },
    { href: actions.historyHref, label: c('history') },
    { href: actions.restoreHref, label: c('restore') },
    { href: actions.rateHref, label: c('rate') },
    { href: actions.reportHref, label: c('report') },
    { href: actions.warnHref, label: c('warn') },
    { href: actions.moderateHref, label: c('moderate') },
  ].filter((item): item is { href: string; label: string } => item.href != null)

  const extra = isEmptyRegion(children) ? null : children

  if (items.length === 0 && extra === null) return null

  return (
    <nav aria-label={c('ariaLabel')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <a key={item.label} href={item.href} className={ACTION}>
          {item.label}
        </a>
      ))}
      {extra}
    </nav>
  )
}
