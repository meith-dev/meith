import type { ForumRowSlotModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function ForumRow({ forum }: ForumRowSlotModel) {
  const isLink = forum.type === 'link'

  return (
    <tr className="border-t border-border align-top odd:bg-card even:bg-muted/40">
      <td className="px-3 py-2">
        <div className="flex items-baseline gap-2">
          {forum.isUnread && (
            <span className="size-1.5 shrink-0 bg-forum-unread" aria-hidden="true" />
          )}
          <a href={forum.href} className="font-medium hover:text-primary">
            {forum.title}
          </a>
          {forum.isUnread && <span className="sr-only">(new posts)</span>}
        </div>
        {forum.description !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{forum.description}</p>
        )}
        {forum.subforums.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground">
            {forum.subforums.map((sub) => (
              <a key={sub.href} href={sub.href} className="hover:text-foreground">
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </td>

      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {isLink ? '' : forum.threadCount}
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {isLink ? '' : forum.postCount}
      </td>
      <td className="w-64 px-3 py-2 text-xs text-muted-foreground">
        {isLink || forum.lastPost === null ? (
          <span className="text-forum-read">{isLink ? '' : 'no posts yet'}</span>
        ) : (
          <>
            <a href={forum.lastPost.href} className="block truncate hover:text-primary">
              {forum.lastPost.threadTitle}
            </a>
            <span>
              <UserRef user={forum.lastPost.author} className="hover:text-foreground" />
              {' · '}
              <time dateTime={forum.lastPost.at.iso}>{forum.lastPost.at.label}</time>
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
