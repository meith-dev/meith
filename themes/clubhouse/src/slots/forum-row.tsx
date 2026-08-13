import type { ForumRowSlotModel } from '@meith/theme-kit'

import { CHIP, HEADING, LINK, MICRO, ReadMark, Stamp, TABLE_ROW, Tally, UserRef } from '../shared'

export function ForumRow({ forum }: ForumRowSlotModel) {
  const isLink = forum.type === 'link'

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className={`${TABLE_ROW} transition-colors hover:bg-accent`}
    >
      <ReadMark unread={forum.isUnread} />

      <div className="min-w-0">
        <a
          href={forum.href}
          className={`${HEADING} text-sm ${forum.isUnread ? 'text-forum-unread' : 'text-forum-read'} ${LINK}`}
        >
          {forum.title}
        </a>
        {forum.isUnread && <span className="sr-only"> (new posts)</span>}
        {isLink && <span className={`${MICRO} ml-2`}>Link</span>}

        {forum.description !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{forum.description}</p>
        )}

        {forum.subforums.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1">
            {forum.subforums.map((sub) => (
              <a key={sub.href} href={sub.href} className={CHIP}>
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </div>

      {!isLink && (
        <>
          <span className="col-start-2 md:col-start-3 md:block md:text-right">
            <Tally value={forum.threadCount} label="threads" />
            <span className="ms-3 md:hidden">
              <Tally value={forum.postCount} label="posts" />
            </span>
          </span>

          <span className="hidden md:block md:text-right">
            <Tally value={forum.postCount} label="posts" />
          </span>

          <div className="col-start-2 min-w-0 text-xs text-muted-foreground md:col-start-5">
            {forum.lastPost === null ? (
              <span className={MICRO}>No posts yet</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className={`block truncate font-semibold text-foreground ${LINK}`}
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span className="mt-0.5 block truncate">
                  <UserRef user={forum.lastPost.author} className="font-medium" />
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
