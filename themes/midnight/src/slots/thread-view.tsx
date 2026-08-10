import type { ThreadViewModel } from '@meith/theme-kit'

export function ThreadView({ thread, forum, replyHref, markReadAction, regions }: ThreadViewModel) {
  const reply =
    replyHref === null ? null : (
      <a
        href={replyHref}
        className="border border-primary bg-primary px-3 py-1 font-mono text-xs text-primary-foreground hover:opacity-90"
      >
        reply
      </a>
    )

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <div>
          <h1 className="font-mono text-lg font-semibold">{thread.title}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            in <a href={forum.href} className="hover:text-primary">{forum.label}</a>
          </p>
        </div>
        {reply}
      </div>

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.tools}</div>
      )}

      {regions.pagination}
      <div className="flex flex-col gap-2">{regions.posts}</div>
      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.afterContent}</div>
      )}

      {regions.quickReply}

      <div className="flex flex-wrap items-center gap-2">
        {reply}
        {markReadAction !== null && (
          <form action={markReadAction} method="post">
            <button
              type="submit"
              className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              mark read
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
