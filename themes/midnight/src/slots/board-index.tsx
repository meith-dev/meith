import type { BoardIndexModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function BoardIndex({
  markAllReadAction,
  regions,
  copy,
}: BoardIndexModel & { copy: SlotCopy }) {
  const latest = regions.latest ?? null
  const hasRail = latest !== null || regions.online !== null || regions.stats !== null
  const c = (key: string) => fromSlotCopy(copy, `midnight.boardIndex.${key}`)

  return (
    <div className="flex flex-col gap-3 p-3">
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post" className="self-end">
          <button
            type="submit"
            className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {c('markAllRead')}
          </button>
        </form>
      )}

      <div
        className={
          hasRail
            ? 'grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]'
            : 'flex min-w-0 flex-col gap-3'
        }
      >
        <div className="flex min-w-0 flex-col gap-3">{regions.categories}</div>

        {hasRail && (
          <aside aria-label={c('activityLabel')} className="flex min-w-0 flex-col gap-3">
            {latest}
            {regions.online}
            {regions.stats}
          </aside>
        )}
      </div>

      {regions.plugins}
    </div>
  )
}
