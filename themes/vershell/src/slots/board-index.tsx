import type { BoardIndexModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { CARD, LABEL, PAGE_BODY, TOUCH } from '../shared'

export function BoardIndex({
  markAllReadAction,
  regions,
  copy,
}: BoardIndexModel & { copy: SlotCopy }) {
  const latest = regions.latest ?? null
  const rail = latest !== null || regions.stats !== null
  const footer = regions.online !== null

  const c = (key: string) => fromSlotCopy(copy, `vershell.boardIndex.${key}`)

  return (
    <div className={PAGE_BODY}>
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-4">{regions.announcements}</div>
      )}

      <div
        className={
          rail
            ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-10'
            : 'flex min-w-0 flex-col gap-8'
        }
      >
        <div className="flex min-w-0 flex-col gap-8">
          {regions.categories}
          {markAllReadAction !== null && (
            <form action={markAllReadAction} method="post" className="self-end">
              <button
                type="submit"
                className={`${LABEL} inline-flex items-center py-2 transition-colors hover:text-foreground ${TOUCH}`}
              >
                {c('markAllRead')}
              </button>
            </form>
          )}
        </div>

        {rail && (
          <aside aria-label={c('boardActivity')} className="flex min-w-0 flex-col gap-6">
            {latest}
            {regions.stats}
          </aside>
        )}
      </div>

      {footer && (
        <div className={`${CARD} px-5 py-4 text-[0.8125rem] leading-relaxed text-muted-foreground`}>
          {regions.online}
        </div>
      )}

      {regions.plugins}
    </div>
  )
}
