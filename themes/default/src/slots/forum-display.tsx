import { Card, CardRows, buttonVariants } from '@meith/ui'
import type { ForumDisplayModel } from '@meith/theme-kit'

import { Counts, PAGE_BODY } from '../shared'

/**
 * A forum page (F30): its title, and the regions the route composes.
 *
 * ## The page's one loud control is "New thread"
 *
 * Everything else on this page — mark read, paging, the jump box — is somewhere
 * a reader might go. Posting is what the forum is *for*, and it is the only
 * filled button on the page. "Mark read" sits beside it as a ghost, because it
 * is a control for somebody who has already decided and does not need finding.
 *
 * On a phone the two swap into a full-width row with the primary action first,
 * where a thumb is.
 *
 * ## The header carries the forum's counters
 *
 * They are in `ForumRowModel` and the previous version of this slot dropped
 * them: a reader who followed a link straight into a forum — from search, from a
 * notification, from outside — had no idea whether they had arrived somewhere
 * with four threads or four thousand. It is one line and it is the cheapest
 * context a page can give.
 */
export function ForumDisplay({ forum, newThreadHref, markReadAction, regions }: ForumDisplayModel) {
  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance">
            {forum.title}
          </h1>
          {forum.description !== null && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{forum.description}</p>
          )}
          {forum.type !== 'link' && (
            <Counts
              className="mt-2"
              items={[
                {
                  label: 'Threads',
                  value: forum.threadCount,
                  one: 'thread',
                  many: 'threads',
                },
                {
                  label: 'Posts',
                  value: forum.postCount,
                  one: 'post',
                  many: 'posts',
                },
              ]}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {markReadAction !== null && (
            /* A POST, for the reason `BoardIndex` states: a GET that mutates
               gets fired by every prefetcher that touches the page. */
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                Mark read
              </button>
            </form>
          )}
          {newThreadHref !== null && (
            <a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
              New thread
            </a>
          )}
        </div>
      </div>

      {/* F71. This forum's announcements and the board's, above its content. */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {regions.subforums}

      {/*
        The thread list. `CardRows` supplies the hairlines; the rows themselves
        are `ThreadRow`, and the pairing is this theme's — a theme whose rows are
        `<tr>` has to put a `<table>` here instead. See the note in
        `themes/midnight/src/theme.ts`, which is that theme and does exactly that.
      */}
      <Card>
        <CardRows>{regions.threads}</CardRows>
      </Card>

      {regions.pagination}
    </div>
  )
}
