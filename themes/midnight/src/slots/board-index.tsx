import type { BoardIndexModel } from '@meith/theme-kit'

export function BoardIndex({ markAllReadAction, regions }: BoardIndexModel) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {(regions.online !== null || regions.stats !== null) && (
        <div className="flex flex-col gap-3">
          {regions.online}
          {regions.stats}
        </div>
      )}

      { }
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      <div className="flex flex-col gap-3">{regions.categories}</div>

      { }
      {regions.plugins}

      {markAllReadAction !== null && (
        <form action={markAllReadAction} method="post">
          <button
            type="submit"
            className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            mark all forums read
          </button>
        </form>
      )}
    </div>
  )
}
