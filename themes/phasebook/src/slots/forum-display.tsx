import type { ForumDisplayModel } from '@meith/theme-kit'

import {
  Circle,
  count,
  FEED,
  isEmptyRegion,
  NUMERIC,
  PAGE,
  PILL,
  PILL_PRIMARY,
  plural,
} from '../shared'

export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        <section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
          <div className="h-24 bg-primary/12" />

          <div className="px-4 pb-4">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-end gap-3">
                <Circle name={forum.title} size={72} className="ring-4 ring-card" />

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

              {markReadAction !== null && (
                <form action={markReadAction} method="post" className="shrink-0">
                  <button type="submit" className={PILL}>
                    Mark read
                  </button>
                </form>
              )}
            </div>

            {forum.description !== null && (
              <p className="mt-3 text-sm text-muted-foreground">{forum.description}</p>
            )}
          </div>
        </section>

        {newThreadHref !== null && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-elevation">
            <Circle name={forum.title} size={40} />
            <a
              href={newThreadHref}
              className="min-w-0 flex-1 truncate rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Start a thread in {forum.title}…
            </a>
            <a href={newThreadHref} className={`hidden sm:inline-flex ${PILL_PRIMARY}`}>
              New thread
            </a>
          </div>
        )}

        {regions.tools !== undefined && (
          <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
        )}

        {regions.announcements !== undefined && (
          <div className="flex flex-col gap-4 empty:hidden">{regions.announcements}</div>
        )}

        {regions.subforums}

        {isEmptyRegion(regions.threads) ? (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center shadow-elevation">
            <p className="text-base font-semibold">No threads here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {newThreadHref === null
                ? 'Nothing has been posted in this forum.'
                : 'Nothing has been posted in this forum. Yours would be the first.'}
            </p>
            {newThreadHref !== null && (
              <a href={newThreadHref} className={`mt-4 ${PILL_PRIMARY}`}>
                Start the first thread
              </a>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">{regions.threads}</ul>
        )}

        {regions.pagination}

        {regions.afterContent !== undefined && (
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 shadow-elevation empty:hidden">
            {regions.afterContent}
          </div>
        )}
      </div>
    </div>
  )
}
