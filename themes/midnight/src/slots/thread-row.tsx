import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function ThreadRow({ thread, select, copy }: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/15' : 'bg-thread-unapproved/15'

  return (
    <tr
      data-visibility={hidden ? thread.visibility : undefined}
      className={`border-t border-border align-top ${hidden ? tint : 'odd:bg-card even:bg-muted/40'}`}
    >
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          {select !== null && (
            <label className="flex items-center">
              <span className="sr-only">{select.label}</span>
              <input
                type="checkbox"
                name={select.name}
                value={select.value}
                form={select.formId}
                className="size-3.5"
              />
            </label>
          )}
          {thread.isUnread && (
            <span className="size-1.5 shrink-0 bg-forum-unread" aria-hidden="true" />
          )}
          {thread.prefix !== null && (
            <span className="border border-border px-1 font-mono text-xs text-secondary-foreground">
              {thread.prefix.label}
            </span>
          )}
          <a href={thread.href} className="font-medium hover:text-primary">
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only">{c('newPosts')}</span>}
          {thread.isSticky && (
            <span className="font-mono text-xs text-thread-pinned">{c('pinned')}</span>
          )}
          {thread.isLocked && (
            <span className="font-mono text-xs text-thread-locked">{c('locked')}</span>
          )}
          {thread.isMoved && (
            <span className="font-mono text-xs text-thread-moved">{c('moved')}</span>
          )}
          {thread.visibility === 'unapproved' && (
            <span className="font-mono text-xs text-thread-unapproved">{c('unapproved')}</span>
          )}
          {thread.visibility === 'deleted' && (
            <span className="font-mono text-xs text-thread-deleted">{c('deleted')}</span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          <UserRef user={thread.author} className="hover:text-foreground" />
        </p>
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {thread.replyCount.label}
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {thread.viewCount.label}
      </td>
      <td className="w-56 px-3 py-2 text-xs text-muted-foreground">
        {thread.lastPost === null ? (
          <span className="text-forum-read">—</span>
        ) : (
          <a href={thread.lastPost.href} className="hover:text-primary">
            <time dateTime={thread.lastPost.at.iso}>{thread.lastPost.at.label}</time>
            <span className="block">
              {c('by')} <UserRef user={thread.lastPost.author} linked={false} />
            </span>
          </a>
        )}
      </td>
    </tr>
  )
}
