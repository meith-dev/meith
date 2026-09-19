import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  Counts,
  ITEM_TITLE,
  Mark,
  META,
  Prefix,
  QUIET_LINK,
  ROW_HOVER,
  RULE,
  Stamp,
  UnreadMark,
  UserRef,
} from '../shared'

export function ThreadRow({
  thread,
  select,
  regions,
  copy,
}: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/8' : 'bg-thread-unapproved/8'

  const marks = [
    thread.prefix !== null && <Prefix key="prefix" prefix={thread.prefix} />,
    thread.isSticky && (
      <Mark key="pinned" tone="thread-pinned">
        {c('pinned')}
      </Mark>
    ),
    thread.isLocked && (
      <Mark key="locked" tone="thread-locked">
        {c('locked')}
      </Mark>
    ),
    thread.isMoved && (
      <Mark key="moved" tone="thread-moved">
        {c('moved')}
      </Mark>
    ),
    thread.visibility === 'unapproved' && (
      <Mark key="unapproved" tone="thread-unapproved">
        {c('unapproved')}
      </Mark>
    ),
    thread.visibility === 'deleted' && (
      <Mark key="deleted" tone="thread-deleted">
        {c('deleted')}
      </Mark>
    ),
  ].filter(Boolean)

  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      data-visibility={hidden ? thread.visibility : undefined}
      className={`group grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 py-4 ${RULE} ${ROW_HOVER} @3xl/card:grid-cols-[minmax(0,1fr)_9rem_15rem] @3xl/card:items-baseline ${hidden ? tint : ''}`}
    >
      <div className="flex min-w-0 items-start gap-3 [overflow-wrap:anywhere]">
        {select !== null && (
          <label className="flex shrink-0 items-center pt-1">
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

        <div className="min-w-0">
          {(marks.length > 0 || regions?.pluginBadges) && (
            <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {marks}
              {regions?.pluginBadges}
            </p>
          )}

          <p className={`${ITEM_TITLE} flex items-baseline gap-2.5`}>
            {thread.isUnread && <UnreadMark className="translate-y-[-0.1em]" />}
            <a href={thread.href} className={QUIET_LINK}>
              {thread.title}
            </a>
            {thread.isUnread && <span className="sr-only"> {c('newPosts')}</span>}
          </p>

          <p className={`${META} mt-0.5`}>
            {c('startedBy')}{' '}
            <UserRef user={thread.author} className="font-normal text-muted-foreground" />
          </p>
        </div>
      </div>

      <Counts
        className="@3xl/card:flex-col @3xl/card:gap-y-0"
        items={[
          {
            label: c('repliesLabel'),
            value: thread.replyCount,
            one: c('reply.one'),
            many: c('reply.other'),
          },
          {
            label: c('viewsLabel'),
            value: thread.viewCount,
            one: c('view.one'),
            many: c('view.other'),
          },
        ]}
      />

      <div className={`${META} min-w-0 @3xl/card:border-l @3xl/card:border-border @3xl/card:pl-5`}>
        {thread.lastPost === null ? (
          <span className="text-thread-moved">{c('noRepliesYet')}</span>
        ) : (
          <>
            <a
              href={thread.lastPost.href}
              className={`block font-medium text-foreground ${QUIET_LINK}`}
            >
              {c('latestReply')}
            </a>
            <span className="block truncate">
              <UserRef
                user={thread.lastPost.author}
                className="font-normal text-muted-foreground"
              />{' '}
              <span aria-hidden="true" className="text-input">
                {c('dot')}
              </span>{' '}
              <Stamp at={thread.lastPost.at} />
            </span>
          </>
        )}
      </div>
    </li>
  )
}
