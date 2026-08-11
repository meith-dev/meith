import type { ForumDisplayModel } from '@meith/theme-kit'

import {
  BTN,
  BTN_PRIMARY,
  COLUMN,
  Hash,
  NUMERIC,
  PAGE,
  PANEL,
  count,
  isEmptyRegion,
  plural,
} from '../shared'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${COLUMN} flex flex-col gap-4`}>
        <section className={`${PANEL} px-4 py-3.5`}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 items-start gap-2">
              <Hash className="mt-1 text-2xl" />

              <div className="min-w-0">
                <h1 className="text-xl leading-tight font-bold tracking-tight text-balance">
                  {forum.title}
                </h1>
                {forum.type !== 'link' && (
                  <p className={`mt-0.5 text-xs text-muted-foreground ${NUMERIC}`}>
                    {count(forum.threadCount)} {plural(forum.threadCount, 'thread', 'threads')} ·{' '}
                    {count(forum.postCount)} {plural(forum.postCount, 'post', 'posts')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {markReadAction !== null && (
                <form action={markReadAction} method="post">
                  <button type="submit" className={BTN}>
                    Mark read
                  </button>
                </form>
              )}
              {newThreadHref !== null && (
                <a href={newThreadHref} className={BTN_PRIMARY}>
                  New thread
                </a>
              )}
            </div>
          </div>

          {forum.description !== null && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
              {forum.description}
            </p>
          )}
        </section>

        {regions.tools !== undefined && (
          <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
        )}

        {regions.announcements !== undefined && (
          <div className="flex flex-col gap-3 empty:hidden">{regions.announcements}</div>
        )}

        {regions.subforums}

        {isEmptyRegion(regions.threads) ? (
          <div className={`${PANEL} px-4 py-10 text-center`}>
            <p className="text-base font-bold">It&rsquo;s quiet in here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {newThreadHref === null
                ? 'Nothing has been posted in this forum.'
                : 'Nothing has been posted in this forum. Yours would be the first.'}
            </p>
            {newThreadHref !== null && (
              <a href={newThreadHref} className={`mt-4 ${BTN_PRIMARY}`}>
                Start the first thread
              </a>
            )}
          </div>
        ) : (
          <ul className={`${PANEL} flex flex-col divide-y divide-border`}>{regions.threads}</ul>
        )}

        {regions.pagination}

        {regions.afterContent !== undefined && (
          <div
            className={`${PANEL} flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-3 empty:hidden`}
          >
            {regions.afterContent}
          </div>
        )}
      </div>
    </div>
  )
}
