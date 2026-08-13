import type { ForumDisplayModel } from '@meith/theme-kit'

import { BUTTON, BUTTON_PRIMARY, Frame, HEADING, MICRO, NUMERIC, RULE } from '../shared'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="border border-border bg-card shadow-elevation">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className={MICRO}>forum</p>
            <h1 className={`${HEADING} text-xl text-foreground`}>{forum.title}</h1>
            {forum.description !== null && (
              <p className="mt-1 text-xs text-muted-foreground">{forum.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`${MICRO} ${NUMERIC} normal-case`}>
              <span className="text-foreground">{forum.threadCount}</span> threads
              <span className="text-border">{' | '}</span>
              <span className="text-foreground">{forum.postCount}</span> posts
            </span>
            {newThreadHref !== null && (
              <a href={newThreadHref} className={BUTTON_PRIMARY}>
                new thread
              </a>
            )}
          </div>
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-4 empty:hidden">{regions.announcements}</div>
      )}

      {regions.subforums}

      {regions.tools !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.tools}</div>
      )}

      <Frame>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={`${MICRO} border-b border-border bg-surface text-left`}>
              <th scope="col" className="px-3 py-2 font-semibold">
                Thread
              </th>
              <th scope="col" className="w-16 px-2 py-2 text-right font-semibold">
                Replies
              </th>
              <th scope="col" className="w-16 px-2 py-2 text-right font-semibold">
                Views
              </th>
              <th scope="col" className="hidden w-52 px-3 py-2 font-semibold sm:table-cell">
                Last post
              </th>
            </tr>
          </thead>
          <tbody>{regions.threads}</tbody>
        </table>
      </Frame>

      {regions.pagination}

      {regions.afterContent !== undefined && (
        <div className="flex flex-col gap-2 empty:hidden">{regions.afterContent}</div>
      )}

      {markReadAction !== null && (
        <form action={markReadAction} method="post">
          <button type="submit" className={BUTTON}>
            mark this forum read
          </button>
        </form>
      )}
    </div>
  )
}
