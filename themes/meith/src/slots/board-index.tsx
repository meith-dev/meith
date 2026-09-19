import type { BoardIndexModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, PAGE_BODY, QUIET_LINK, RULE, TOUCH } from '../shared'

export function BoardIndex({
  markAllReadAction,
  regions,
  copy,
}: BoardIndexModel & { copy: SlotCopy }) {
  const latest = regions.latest ?? null
  const rail = latest !== null || regions.stats !== null
  const footer = regions.online !== null

  const c = (key: string) => fromSlotCopy(copy, `meith.boardIndex.${key}`)

  return (
    <div className={PAGE_BODY}>
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-6">{regions.announcements}</div>
      )}

      <div
        className={
          rail
            ? 'grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-16'
            : 'flex min-w-0 flex-col gap-10'
        }
      >
        <div className="flex min-w-0 flex-col gap-10">
          {regions.categories}
          {markAllReadAction !== null && (
            <form action={markAllReadAction} method="post" className="self-end">
              <button
                type="submit"
                className={`${LABEL} inline-flex items-center py-2 ${QUIET_LINK} ${TOUCH}`}
              >
                {c('markAllRead')}
              </button>
            </form>
          )}
        </div>

        {rail && (
          <aside aria-label={c('boardActivity')} className="flex min-w-0 flex-col gap-10">
            {latest}
            {regions.stats}
          </aside>
        )}
      </div>

      {footer && (
        <div className={`${RULE} pt-5 text-[0.8125rem] leading-relaxed text-muted-foreground`}>
          {regions.online}
        </div>
      )}

      {regions.plugins}
    </div>
  )
}
