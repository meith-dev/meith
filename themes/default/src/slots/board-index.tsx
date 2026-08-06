import { buttonVariants } from '@meith/ui'
import type { BoardIndexModel } from '@meith/theme-kit'

import { PAGE_BODY } from '../shared'

export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const hasPanels = regions.stats !== null || regions.online !== null

  return (
    <div className={PAGE_BODY}>
      { }
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

      <div className="flex flex-col gap-4">{regions.categories}</div>

      {hasPanels && (
        <div className="grid gap-4 lg:grid-cols-2">
          {regions.online}
          {regions.stats}
        </div>
      )}

      { }
      {regions.plugins}
    </div>
  )
}
