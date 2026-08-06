import { Badge } from '@meith/ui'
import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { Counts, LINK, Prefix, ReadSpacer, Stamp, UnreadDot, UserRef } from '../shared'

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/60 md:grid-cols-[auto_minmax(0,1fr)_9rem_14rem] md:items-center md:gap-x-4"
    >
      <span className="flex items-start gap-2">
        { }
        {select !== null && (
          <label className="mt-0.5 flex shrink-0 items-start">
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

        {thread.isUnread ? <UnreadDot /> : <ReadSpacer />}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
          {thread.isSticky && <Badge tone="pinned">Pinned</Badge>}
          {thread.isLocked && <Badge tone="locked">Locked</Badge>}
          {thread.isMoved && <Badge tone="moved">Moved</Badge>}

          <a
            href={thread.href}
            className={
              (thread.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
              ` ${LINK}`
            }
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> (new posts)</span>}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          Started by <UserRef user={thread.author} className="font-normal" />
        </p>
      </div>

      <Counts
        className="col-start-2 md:col-start-3 md:justify-end"
        items={[
          {
            label: 'Replies',
            value: thread.replyCount,
            one: 'reply',
            many: 'replies',
          },
          {
            label: 'Views',
            value: thread.viewCount,
            one: 'view',
            many: 'views',
          },
        ]}
      />

      <div className="col-start-2 min-w-0 text-xs text-muted-foreground md:col-start-4">
        {thread.lastPost === null ? (
          <span className="text-thread-moved">No replies yet</span>
        ) : (
          <>
            <a href={thread.lastPost.href} className={`block font-medium text-foreground ${LINK}`}>
              { }
              Latest reply
            </a>
            <span className="mt-0.5 block truncate">
              {'by '}
              <UserRef user={thread.lastPost.author} className="font-normal" />
              {' · '}
              <Stamp at={thread.lastPost.at} />
            </span>
          </>
        )}
      </div>
    </li>
  )
}
