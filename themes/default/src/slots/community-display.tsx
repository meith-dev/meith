import {
  Card,
  CardRows,
  Empty,
  EmptyAction,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
} from '@meith/ui'
import type { CommunityDisplayModel } from '@meith/theme-kit'

import { Counts, PAGE_BODY, isEmptyRegion } from '../shared'

/**
 * A community page (F30): its title, and the regions the route composes.
 *
 * ## The page's one loud control is "New thread"
 *
 * Everything else on this page — mark read, paging, the jump box — is somewhere
 * a reader might go. Posting is what the community is *for*, and it is the only
 * filled button on the page. "Mark read" sits beside it as a ghost, because it
 * is a control for somebody who has already decided and does not need finding.
 *
 * On a phone the two swap into a full-width row with the primary action first,
 * where a thumb is.
 *
 * ## An empty community says so
 *
 * It did not. `regions.threads` arrives as a rendered list, an empty community
 * renders an empty one, and `CardRows` drew that as a bordered box containing a
 * single hairline — a 1px rule where a listing should be, with no words
 * anywhere on the page saying the community is new rather than broken. That is the
 * state every community on a board is in on its first day, and it is the day a
 * visitor is deciding whether to stay. `@meith/ui`'s `Empty` was written for
 * exactly this and had no caller.
 *
 * ## The header carries the community's counters
 *
 * They are in `CommunityRowModel` and the previous version of this slot dropped
 * them: a reader who followed a link straight into a community — from search, from a
 * notification, from outside — had no idea whether they had arrived somewhere
 * with four threads or four thousand. It is one line and it is the cheapest
 * context a page can give.
 */
export function CommunityDisplay({ community, newThreadHref, markReadAction, regions }: CommunityDisplayModel) {
  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {community.title}
          </h1>
          {community.description !== null && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{community.description}</p>
          )}
          {community.type !== 'link' && (
            <Counts
              className="mt-2"
              items={[
                {
                  label: 'Threads',
                  value: community.threadCount,
                  one: 'thread',
                  many: 'threads',
                },
                {
                  label: 'Posts',
                  value: community.postCount,
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

      {/*
        Theme API 1.3 — the ordering tabs, under the heading rather than above
        the whole page. A community page used to open with "Latest · Top rated"
        before it said which community was being sorted. Following the community is not
        here; see `regions.afterContent` at the foot of this slot.
      */}
      {regions.tools !== undefined && (
        <div className="flex flex-col gap-3 empty:hidden">{regions.tools}</div>
      )}

      {/* F71. This community's announcements and the board's, above its content. */}
      {regions.announcements !== undefined && (
        <div className="flex flex-col gap-3">{regions.announcements}</div>
      )}

      {regions.subcommunities}

      {/*
        The thread list. `CardRows` supplies the hairlines; the rows themselves
        are `ThreadRow`, and the pairing is this theme's — a theme whose rows are
        `<tr>` has to put a `<table>` here instead. See the note in
        `themes/midnight/src/theme.ts`, which is that theme and does exactly that.
      */}
      <Card>
        {isEmptyRegion(regions.threads) ? (
          <Empty>
            <EmptyTitle>No threads here yet</EmptyTitle>
            <EmptyDescription>
              {newThreadHref === null
                ? 'Nothing has been posted in this community.'
                : 'Nothing has been posted in this community. Yours would be the first.'}
            </EmptyDescription>
            {newThreadHref !== null && (
              <EmptyAction>
                <a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
                  Start the first thread
                </a>
              </EmptyAction>
            )}
          </Empty>
        ) : (
          <CardRows>{regions.threads}</CardRows>
        )}
      </Card>

      {regions.pagination}

      {/*
        Theme API 1.4 — following this community, after the threads rather than
        above them. "Do you want to hear about this?" is a question somebody
        can only answer once they have seen what is in it.

        A hairline and a row, not a card: it is one control, and a bordered
        panel holding one `<select>` and one button reads as a section of the
        page rather than as a footnote to it. `ThreadView` draws the same strip
        for the same reason.
      */}
      {regions.afterContent !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-4 empty:hidden">
          {regions.afterContent}
        </div>
      )}
    </div>
  )
}
