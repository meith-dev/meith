import type { ForumRowSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function ForumRow({ forum, copy }: ForumRowSlotModel & { copy: SlotCopy }) {
  const isLink = forum.type === 'link'
  const c = (key: string) => fromSlotCopy(copy, `midnight.forumRow.${key}`)

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
          {forum.isUnread && <span className="sr-only">{c('newPosts')}</span>}
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
        {!isLink && (
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted-foreground md:hidden">
            <span>
              <span className="text-foreground">{forum.threadCount.label}</span> {c('threadsLabel')}
            </span>
            <span>
              <span className="text-foreground">{forum.postCount.label}</span> {c('postsLabel')}
            </span>
            {forum.lastPost !== null && (
              <span className="min-w-0">
                <a href={forum.lastPost.href} className="text-foreground hover:text-primary">
                  {forum.lastPost.threadTitle}
                </a>
                {' · '}
                <UserRef user={forum.lastPost.author} className="hover:text-foreground" />
                {' · '}
                <time dateTime={forum.lastPost.at.iso}>{forum.lastPost.at.label}</time>
              </span>
            )}
          </p>
        )}
      </td>

      <td className="hidden w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground md:table-cell">
        {isLink ? '' : forum.threadCount.label}
      </td>
      <td className="hidden w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground md:table-cell">
        {isLink ? '' : forum.postCount.label}
      </td>
      <td className="hidden w-64 px-3 py-2 text-xs text-muted-foreground md:table-cell">
        {isLink || forum.lastPost === null ? (
          <span className="text-forum-read">{isLink ? '' : c('noPosts')}</span>
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
