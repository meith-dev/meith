import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Circle, count, MUTED_LINK, NUMERIC, Prefix, plural, Stamp, Tag, UserRef } from '../shared'

export function ThreadRow({ thread, select, copy }: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/8' : 'bg-thread-unapproved/8'

  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      data-visibility={hidden ? thread.visibility : undefined}
      className={`overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation transition-colors hover:border-input ${hidden ? tint : ''}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {select !== null && (
          <label className="mt-2.5 flex shrink-0 items-start">
            <span className="sr-only">{select.label}</span>
            <input
              type="checkbox"
              name={select.name}
              value={select.value}
              form={select.formId}
              className="size-4 accent-primary"
            />
          </label>
        )}

        <span className="relative shrink-0">
          <Circle name={thread.author.username} size={40} />
          {thread.isUnread && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-forum-unread ring-2 ring-card"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
            {thread.isSticky && <Tag token="thread-pinned">{c('pinned')}</Tag>}
            {thread.isLocked && <Tag token="thread-locked">{c('locked')}</Tag>}
            {thread.isMoved && <Tag token="thread-moved">{c('moved')}</Tag>}
            {thread.visibility === 'unapproved' && (
              <Tag token="thread-unapproved">{c('unapproved')}</Tag>
            )}
            {thread.visibility === 'deleted' && <Tag token="thread-deleted">{c('deleted')}</Tag>}
          </div>

          <a
            href={thread.href}
            className={`mt-0.5 block text-[0.9375rem] leading-snug hover:underline ${thread.isUnread ? 'font-bold' : 'font-semibold'}`}
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> {c('newPosts')}</span>}

          <p className="mt-0.5 text-xs text-muted-foreground">
            {c('startedBy')} <UserRef user={thread.author} className="text-xs font-medium" />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span className={NUMERIC}>
          {count(thread.replyCount)} {plural(thread.replyCount, c('reply.one'), c('reply.other'))} ·{' '}
          {count(thread.viewCount)} {plural(thread.viewCount, c('view.one'), c('view.other'))}
        </span>

        <span className="min-w-0 truncate">
          {thread.lastPost === null ? (
            <span className="text-thread-moved">{c('noRepliesYet')}</span>
          ) : (
            <>
              <a href={thread.lastPost.href} className={`font-semibold ${MUTED_LINK}`}>
                {c('latestReply')}
              </a>
              {` ${c('by')} `}
              <UserRef user={thread.lastPost.author} className="text-xs font-medium" />
              {' · '}
              <Stamp at={thread.lastPost.at} />
            </>
          )}
        </span>
      </div>
    </li>
  )
}
