import type { BoardIndexModel } from '@meith/theme-kit'
import { buttonVariants } from '@meith/ui'

import { PAGE_BODY } from '../shared'

export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const rail = (regions.latest ?? null) !== null
  const footer = regions.stats !== null || regions.online !== null

  return (
    <div className={PAGE_BODY}>
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post" className="self-end">
          <button type="submit" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Mark all forums read
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
          <aside aria-label="Board activity" className="flex min-w-0 flex-col gap-4">
            {regions.latest}
          </aside>
        )}
      </div>

      {footer && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          {regions.online}
          {regions.stats}
        </div>
      )}

      {regions.plugins}
    </div>
  )
}
