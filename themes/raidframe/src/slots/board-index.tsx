import type { BoardIndexModel } from '@meith/theme-kit'

import { BUTTON } from '../shared'

export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const latest = regions.latest ?? null

  return (
    <div className="flex flex-col gap-4 p-4">
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-4 empty:hidden">{regions.announcements}</div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">{regions.categories}</div>

        <aside className="flex flex-col gap-4 empty:hidden lg:w-80 lg:shrink-0">
          {regions.online}
          {regions.stats}
          {latest}
        </aside>
      </div>

      {regions.plugins}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post">
          <button type="submit" className={BUTTON}>
            mark all read
          </button>
        </form>
      )}
    </div>
  )
}
