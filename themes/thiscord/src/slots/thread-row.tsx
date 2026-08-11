import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { Circle, MUTED_LINK, NUMERIC, Prefix, Stamp, Tag, UnreadPill, UserRef, count, plural } from '../shared'

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      className="relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent"
    >
      {thread.isUnread && <UnreadPill className="left-0" />}

      {select !== null && (
        <label className="mt-1 flex shrink-0 items-start">
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

      <Circle name={thread.author.username} size={40} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
          {thread.isSticky && <Tag token="thread-pinned">Pinned</Tag>}
          {thread.isLocked && <Tag token="thread-locked">Locked</Tag>}
          {thread.isMoved && <Tag token="thread-moved">Moved</Tag>}

          <a
            href={thread.href}
            className={`text-[0.9375rem] leading-snug hover:underline ${thread.isUnread ? 'font-bold text-forum-unread' : 'font-medium text-foreground'}`}
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> (new posts)</span>}
        </div>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <UserRef user={thread.author} className="text-xs" />
          {' started this · '}
          <span className={NUMERIC}>
            {count(thread.replyCount)} {plural(thread.replyCount, 'reply', 'replies')} ·{' '}
            {count(thread.viewCount)} {plural(thread.viewCount, 'view', 'views')}
          </span>
        </p>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {thread.lastPost === null ? (
            <span className="text-thread-moved">No replies yet</span>
          ) : (
            <>
              <a href={thread.lastPost.href} className={`font-medium ${MUTED_LINK}`}>
                Latest reply
              </a>
              {' by '}
              <UserRef user={thread.lastPost.author} className="text-xs" />
              {' · '}
              <Stamp at={thread.lastPost.at} />
            </>
          )}
        </p>
      </div>
    </li>
  )
}
