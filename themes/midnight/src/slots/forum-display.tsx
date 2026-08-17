import type { ForumDisplayModel } from '@meith/theme-kit'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg font-semibold">{forum.title}</h1>
        {newThreadHref !== null && (
          <a
            href={newThreadHref}
            className="border border-primary bg-primary px-3 py-1 font-mono text-xs text-primary-foreground hover:opacity-90"
          >
            new thread
          </a>
        )}
      </div>

      {forum.description !== null && (
        <p className="text-sm text-muted-foreground">{forum.description}</p>
      )}

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.tools}</div>
      )}

      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {regions.subforums}

      <table className="w-full border-collapse border border-border text-sm">
        <thead>
          <tr className="bg-secondary text-left font-mono text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-1.5">
              Thread
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right">
              Replies
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right">
              Views
            </th>
            <th scope="col" className="w-56 px-3 py-1.5">
              Last post
            </th>
          </tr>
        </thead>
        <tbody>{regions.threads}</tbody>
      </table>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.afterContent}</div>
      )}

      {markReadAction !== null && (
        <form action={markReadAction} method="post">
          <button
            type="submit"
            className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            mark this forum read
          </button>
        </form>
      )}
    </div>
  )
}
