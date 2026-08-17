import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { Circle, count, MUTED_LINK, NUMERIC, Prefix, plural, Stamp, Tag, UserRef } from '../shared'

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation transition-colors hover:border-input"
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
            {thread.isSticky && <Tag token="thread-pinned">Pinned</Tag>}
            {thread.isLocked && <Tag token="thread-locked">Locked</Tag>}
            {thread.isMoved && <Tag token="thread-moved">Moved</Tag>}
          </div>

          <a
            href={thread.href}
            className={`mt-0.5 block text-[0.9375rem] leading-snug hover:underline ${thread.isUnread ? 'font-bold' : 'font-semibold'}`}
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> (new posts)</span>}

          <p className="mt-0.5 text-xs text-muted-foreground">
            Started by <UserRef user={thread.author} className="text-xs font-medium" />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span className={NUMERIC}>
          {count(thread.replyCount)} {plural(thread.replyCount, 'reply', 'replies')} ·{' '}
          {count(thread.viewCount)} {plural(thread.viewCount, 'view', 'views')}
        </span>

        <span className="min-w-0 truncate">
          {thread.lastPost === null ? (
            <span className="text-thread-moved">No replies yet</span>
          ) : (
            <>
              <a href={thread.lastPost.href} className={`font-semibold ${MUTED_LINK}`}>
                Latest reply
              </a>
              {' by '}
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
