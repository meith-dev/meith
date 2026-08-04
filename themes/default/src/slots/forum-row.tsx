import type { ForumRowSlotModel } from '@meith/theme-kit'

import { Counts, LINK, MUTED_LINK, ReadSpacer, Stamp, UnreadDot, UserRef } from '../shared'

/**
 * One forum in a listing (F29).
 *
 * Four things here are decisions rather than styling.
 *
 * **Unread is not conveyed by colour alone.** The marker carries text for screen
 * readers, because "this forum has new posts" is information, and information
 * that exists only as a hue is absent for a substantial number of readers. The
 * title also goes to full weight when unread, so the row is distinguishable in
 * greyscale and at a glance — a dot alone is two pixels of difference at the
 * distance a listing is actually read from.
 *
 * **A read row keeps the marker's space.** `ReadSpacer` renders an empty box the
 * size of the dot, so every title on the page starts in the same column. Without
 * it the listing indents and un-indents as forums are read, which is the sort of
 * thing nobody can name and everybody notices.
 *
 * **The last-post author is a link only when there is somewhere to link to.**
 * `profileHref` is null for a deleted account, and the name renders either way.
 * A listing that crashes or blanks a row because an account was deleted is the
 * standard forum-software bug; `UserRef` is where that is handled once.
 *
 * **The timestamp is `<time>` with the machine value in `datetime`.** The visible
 * label is preformatted in the board's zone (see `TimeModel`), so this element is
 * the only place a machine — or a future relative-time island — can recover the
 * exact instant.
 *
 * ## The grid
 *
 * Three columns from `md` up — subject, counters, last post — declared on the
 * row rather than on a wrapping table, so `CategoryBlock` stays a `<ul>` and a
 * theme that wants a real `<table>` (see `themes/midnight`) can have one without
 * this file being involved. Below `md` the row stacks and the counters become a
 * single line under the title, which is the order somebody reads them in anyway.
 */
export function ForumRow({ forum }: ForumRowSlotModel) {
  /* A link row navigates away and has no threads, so it has no columns either. */
  const isLink = forum.type === 'link'

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className={
        'grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/60' +
        (isLink ? '' : ' md:grid-cols-[minmax(0,1fr)_auto_15rem] md:items-center')
      }
    >
      <div className="flex min-w-0 gap-2.5">
        {forum.isUnread ? <UnreadDot /> : <ReadSpacer />}

        <div className="min-w-0">
          <a
            href={forum.href}
            className={
              (forum.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
              ` ${LINK}`
            }
          >
            {forum.title}
          </a>
          {forum.isUnread && <span className="sr-only"> (new posts)</span>}

          {forum.description !== null && (
            <p className="mt-0.5 text-sm text-muted-foreground">{forum.description}</p>
          )}

          {forum.subforums.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Subforums</span>
              {forum.subforums.map((sub) => (
                <a key={sub.href} href={sub.href} className={MUTED_LINK}>
                  {sub.label}
                </a>
              ))}
            </p>
          )}
        </div>
      </div>

      {!isLink && (
        <>
          {/*
           * `whitespace-nowrap` and a fixed column: a four-digit post count
           * wraps "143 posts" onto two lines while its neighbour stays on one,
           * and the rows stop lining up — which on a list of twenty forums reads
           * as broken rather than tight.
           */}
          <Counts
            className="md:w-36 md:justify-end"
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

          <div className="min-w-0 text-xs text-muted-foreground">
            {forum.lastPost === null ? (
              <span className="text-forum-read">No posts yet</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className={`block truncate font-medium text-foreground ${LINK}`}
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span className="mt-0.5 block truncate">
                  {'by '}
                  <UserRef user={forum.lastPost.author} className="font-normal" />
                  {' · '}
                  <Stamp at={forum.lastPost.at} />
                </span>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}
