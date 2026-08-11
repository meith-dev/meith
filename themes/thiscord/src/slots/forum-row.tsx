import type { ForumRowSlotModel } from '@meith/theme-kit'

import { Hash, MUTED_LINK, NUMERIC, Stamp, UnreadPill, UserRef, count, plural } from '../shared'

export function ForumRow({ forum }: ForumRowSlotModel) {
  const isLink = forum.type === 'link'

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className="relative rounded-sm px-2 py-2 transition-colors hover:bg-accent"
    >
      {forum.isUnread && <UnreadPill />}

      <div className="flex items-start gap-2">
        <Hash className="mt-px" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <a
              href={forum.href}
              className={`text-[0.9375rem] hover:underline ${forum.isUnread ? 'font-bold text-forum-unread' : 'font-medium text-foreground'}`}
            >
              {forum.title}
            </a>
            {forum.isUnread && <span className="sr-only"> (new posts)</span>}

            {!isLink && (
              <span className={`shrink-0 text-xs text-muted-foreground ${NUMERIC}`}>
                {count(forum.threadCount)} {plural(forum.threadCount, 'thread', 'threads')} ·{' '}
                {count(forum.postCount)} {plural(forum.postCount, 'post', 'posts')}
              </span>
            )}
          </div>

          {forum.description !== null && (
            <p className="mt-0.5 text-sm text-muted-foreground">{forum.description}</p>
          )}

          {forum.subforums.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {forum.subforums.map((sub) => (
                <a
                  key={sub.href}
                  href={sub.href}
                  className="inline-flex items-center rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                >
                  #{sub.label}
                </a>
              ))}
            </p>
          )}

          {!isLink && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {forum.lastPost === null ? (
                <span className="text-forum-read">No posts yet</span>
              ) : (
                <>
                  <a href={forum.lastPost.href} className={`font-medium ${MUTED_LINK}`}>
                    {forum.lastPost.threadTitle}
                  </a>
                  {' — '}
                  <UserRef user={forum.lastPost.author} className="text-xs" />
                  {' · '}
                  <Stamp at={forum.lastPost.at} />
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
