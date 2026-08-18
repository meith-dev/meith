import type { BoardIndexModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, cn } from '@meith/ui'

import { BUTTON, PAGE_BODY } from '../shared'

export function BoardIndex({
  markAllReadAction,
  regions,
  copy,
}: BoardIndexModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.boardIndex.${key}`)

  const rail = (regions.latest ?? null) !== null
  const footer = regions.stats !== null || regions.online !== null

  return (
    <div className={PAGE_BODY}>
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post" className="self-end">
          <button
            type="submit"
            className={cn(BUTTON, 'bg-secondary text-secondary-foreground hover:bg-secondary/80')}
          >
            {c('markAllRead')}
          </button>
        </form>
      )}

      <div
        className={
          rail
            ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start'
            : 'flex min-w-0 flex-col gap-4'
        }
      >
        <div className="flex min-w-0 flex-col gap-4">{regions.categories}</div>

        {rail && (
          <aside aria-label={c('boardActivity')} className="flex min-w-0 flex-col gap-4">
            {regions.latest}
          </aside>
        )}
      </div>

      {footer && (
        <Card className="flex flex-col gap-2 px-4 py-3">
          {regions.stats}
          {regions.online}
        </Card>
      )}

      {regions.plugins}
    </div>
  )
}
