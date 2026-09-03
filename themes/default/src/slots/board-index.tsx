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
        <form action={markAllReadAction} method="post" className="-mb-3 self-end">
          <button type="submit" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {c('markAllRead')}
          </button>
        </form>
      )}

      <div
        className={
          rail
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start'
            : 'flex min-w-0 flex-col gap-5'
        }
      >
        <div className="flex min-w-0 flex-col gap-5">{regions.categories}</div>

        {rail && (
          <aside aria-label={c('boardActivity')} className="flex min-w-0 flex-col gap-5">
            {latest}
            {regions.stats}
          </aside>
        )}
      </div>

      {footer && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-elevation">
          {regions.online}
        </div>
      )}

      {regions.plugins}
    </div>
  )
}
