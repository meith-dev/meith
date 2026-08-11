import type { BoardIndexModel } from '@meith/theme-kit'

import { FEED, PAGE, PILL_QUIET, isEmptyRegion } from '../shared'

export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  const hasRail = [regions.latest, regions.online, regions.stats].some(
    (region) => !isEmptyRegion(region),
  )

  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div
        className={
          hasRail
            ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'
            : `${FEED} flex flex-col`
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          {regions.announcements !== undefined && (
            <div className="flex flex-col gap-4 empty:hidden">{regions.announcements}</div>
          )}

          {markAllReadAction !== null && (
            <form action={markAllReadAction} method="post" className="self-end">
              <button type="submit" className={PILL_QUIET}>
                Mark all forums read
              </button>
            </form>
          )}

          <div className="flex min-w-0 flex-col gap-4">{regions.categories}</div>

          {regions.plugins}
        </div>

        {hasRail && (
          <aside
            aria-label="Board activity"
            className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem]"
          >
            {regions.latest}
            {regions.online}
            {regions.stats}
          </aside>
        )}
      </div>
    </div>
  )
}
