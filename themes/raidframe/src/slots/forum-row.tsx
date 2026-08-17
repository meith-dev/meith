import type { ForumRowSlotModel } from '@meith/theme-kit'

import { HEADING, MICRO, NUMERIC, ReadPip, Stamp, UserRef } from '../shared'

export function ForumRow({ forum }: ForumRowSlotModel) {
  const isLink = forum.type === 'link'

  return (
    <tr className="border-t border-border align-top hover:bg-secondary/50">
      <td className="px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <ReadPip unread={forum.isUnread} className="mt-1.5" />
          <div className="min-w-0">
            <a
              href={forum.href}
              className={`${HEADING} text-sm text-foreground hover:text-primary`}
            >
              {forum.title}
            </a>
            {forum.isUnread && <span className="sr-only">(new posts)</span>}
            {isLink && <span className={`${MICRO} ml-2`}>link</span>}

            {forum.description !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground">{forum.description}</p>
            )}

            {forum.subforums.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {forum.subforums.map((sub) => (
                  <a
                    key={sub.href}
                    href={sub.href}
                    className="border border-border bg-surface px-1.5 py-0.5 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase hover:border-primary/60 hover:text-primary"
                  >
                    {sub.label}
                  </a>
                ))}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-foreground`}>
        {isLink ? <span className="text-muted-foreground">—</span> : forum.threadCount}
      </td>
      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-foreground`}>
        {isLink ? <span className="text-muted-foreground">—</span> : forum.postCount}
      </td>

      <td className="hidden w-60 px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
        {isLink || forum.lastPost === null ? (
          <span className={MICRO}>{isLink ? '' : 'no posts yet'}</span>
        ) : (
          <>
            <a
              href={forum.lastPost.href}
              className="block truncate text-foreground hover:text-primary"
            >
              {forum.lastPost.threadTitle}
            </a>
            <span className={`${MICRO} mt-0.5 block normal-case`}>
              <UserRef user={forum.lastPost.author} className="hover:text-primary" />
              {' · '}
              <Stamp at={forum.lastPost.at} />
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
