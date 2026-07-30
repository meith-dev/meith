import type { ForumRowSlotModel } from '@forum/theme-kit'

/**
 * One forum in a listing (F29).
 *
 * Three things here are decisions rather than styling:
 *
 * **Unread is not conveyed by colour alone.** The marker carries text for screen
 * readers, because "this forum has new posts" is information, and information
 * that exists only as a hue is absent for a substantial number of readers.
 *
 * **The last-post author is a link only when there is somewhere to link to.**
 * `profileHref` is null for a deleted account (and, until F33, for everyone), and
 * the name renders either way. A listing that crashes or blanks a row because an
 * account was deleted is the standard forum-software bug.
 *
 * **The timestamp is `<time>` with the machine value in `datetime`.** The visible
 * label is preformatted in the board's zone (see `TimeModel`), so this element is
 * the only place a machine — or a future relative-time island — can recover the
 * exact instant.
 */
export function ForumRow({ forum }: ForumRowSlotModel) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {forum.isUnread && (
            <span className="size-2 shrink-0 rounded-full bg-forum-unread" aria-hidden="true" />
          )}
          <a
            href={forum.href}
            className="truncate font-medium text-foreground hover:text-primary"
          >
            {forum.title}
          </a>
          {forum.isUnread && <span className="sr-only">(new posts)</span>}
        </div>

        {forum.description !== null && (
          <p className="mt-0.5 text-sm text-muted-foreground">{forum.description}</p>
        )}

        {forum.subforums.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium">Subforums:</span>
            {forum.subforums.map((sub) => (
              <a key={sub.href} href={sub.href} className="hover:text-foreground">
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </div>

      {/*
       * A link row navigates away and has no threads of its own, so the counters
       * and last-post columns are omitted rather than rendered as zeroes.
       */}
      {forum.type !== 'link' && (
        <>
          {/*
           * `whitespace-nowrap` and a fixed width: a four-digit post count wraps
           * "143 posts" onto two lines while its neighbour stays on one, and the
           * rows stop lining up — which on a list of twenty forums reads as
           * broken rather than tight.
           */}
          <dl className="flex shrink-0 gap-4 text-xs whitespace-nowrap text-muted-foreground sm:w-40">
            <div>
              <dt className="sr-only">Threads</dt>
              <dd>
                <span className="font-medium text-foreground">{forum.threadCount}</span> threads
              </dd>
            </div>
            <div>
              <dt className="sr-only">Posts</dt>
              <dd>
                <span className="font-medium text-foreground">{forum.postCount}</span> posts
              </dd>
            </div>
          </dl>

          <div className="shrink-0 text-xs text-muted-foreground sm:w-56">
            {forum.lastPost === null ? (
              <span className="text-forum-read">No posts yet</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className="block truncate font-medium text-foreground hover:text-primary"
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span>
                  {'by '}
                  {forum.lastPost.author.profileHref === null ? (
                    forum.lastPost.author.username
                  ) : (
                    <a
                      href={forum.lastPost.author.profileHref}
                      className="hover:text-foreground"
                    >
                      {forum.lastPost.author.username}
                    </a>
                  )}
                  {', '}
                  <time dateTime={forum.lastPost.at.iso}>{forum.lastPost.at.label}</time>
                </span>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}
