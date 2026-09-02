import type { BoardIndexModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { buttonVariants } from '@meith/ui'

import { PAGE_BODY } from '../shared'

export function BoardIndex({
  markAllReadAction,
  regions,
  copy,
}: BoardIndexModel & { copy: SlotCopy }) {
  const latest = regions.latest ?? null
  const rail = latest !== null || regions.stats !== null
  const footer = regions.online !== null

  const c = (key: string) => fromSlotCopy(copy, `default.boardIndex.${key}`)

  return (
    <div className={PAGE_BODY}>
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post" className="-mb-2 self-end">
          <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {c('markAllRead')}
          </button>
        </form>
      )}

      <div
        className={
          rail
            ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'
            : 'flex min-w-0 flex-col gap-4'
        }
      >
        <div className="flex min-w-0 flex-col gap-4">{regions.categories}</div>

        {rail && (
          <aside aria-label={c('boardActivity')} className="flex min-w-0 flex-col gap-4">
            {latest}
            {regions.stats}
          </aside>
        )}
      </div>

      {footer && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          {regions.online}
        </div>
      )}

      {regions.plugins}
    </div>
  )
}
