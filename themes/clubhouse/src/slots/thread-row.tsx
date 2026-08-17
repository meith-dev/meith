import type { ThreadRowSlotModel } from '@meith/theme-kit'
import { Badge } from '@meith/ui'

import { HEADING, LINK, MICRO, Prefix, ReadMark, Stamp, TABLE_ROW, Tally, UserRef } from '../shared'

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      className={`${TABLE_ROW} transition-colors hover:bg-accent`}
    >
      <span className="flex items-start gap-2">
        {select !== null && (
          <label className="flex shrink-0 items-start">
            <span className="sr-only">{select.label}</span>
            <input
              type="checkbox"
              name={select.name}
              value={select.value}
              form={select.formId}
              className="mt-0.5 size-3.5 accent-primary"
            />
          </label>
        )}

        <ReadMark unread={thread.isUnread} />
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
          {thread.isSticky && <Badge tone="pinned">Pinned</Badge>}
          {thread.isLocked && <Badge tone="locked">Locked</Badge>}
          {thread.isMoved && <Badge tone="moved">Moved</Badge>}

          <a
            href={thread.href}
            className={`${HEADING} text-sm ${thread.isUnread ? 'text-forum-unread' : 'text-forum-read'} ${LINK}`}
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> (new posts)</span>}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          Started by <UserRef user={thread.author} className="font-medium" />
        </p>
      </div>

      <span className="col-start-2 md:col-start-3 md:block md:text-right">
        <Tally value={thread.replyCount} label="replies" />
        <span className="ms-3 md:hidden">
          <Tally value={thread.viewCount} label="views" />
        </span>
      </span>

      <span className="hidden md:block md:text-right">
        <Tally value={thread.viewCount} label="views" />
      </span>

      <div className="col-start-2 min-w-0 text-xs text-muted-foreground md:col-start-5">
        {thread.lastPost === null ? (
          <span className={MICRO}>No replies yet</span>
        ) : (
          <>
            <a
              href={thread.lastPost.href}
              className={`block font-semibold text-foreground ${LINK}`}
            >
              Latest reply
            </a>
            <span className="mt-0.5 block truncate">
              <UserRef user={thread.lastPost.author} className="font-medium" />
              {' · '}
              <Stamp at={thread.lastPost.at} />
            </span>
          </>
        )}
      </div>
    </li>
  )
}
