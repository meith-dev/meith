import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Badge } from '@meith/ui'

import { HEADING, LINK, MICRO, Prefix, ReadMark, Stamp, TABLE_ROW, Tally, UserRef } from '../shared'

export function ThreadRow({
  thread,
  select,
  regions,
  copy,
}: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/8' : 'bg-thread-unapproved/8'

  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      data-visibility={hidden ? thread.visibility : undefined}
      className={`${TABLE_ROW} transition-colors hover:bg-accent ${hidden ? tint : ''}`}
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
          {thread.isSticky && <Badge tone="pinned">{c('pinned')}</Badge>}
          {thread.isLocked && <Badge tone="locked">{c('locked')}</Badge>}
          {thread.isMoved && <Badge tone="moved">{c('moved')}</Badge>}
          {thread.visibility === 'unapproved' && <Badge tone="unapproved">{c('unapproved')}</Badge>}
          {thread.visibility === 'deleted' && <Badge tone="deleted">{c('deleted')}</Badge>}

          <a
            href={thread.href}
            className={`${HEADING} text-sm ${thread.isUnread ? 'text-forum-unread' : 'text-forum-read'} ${LINK}`}
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> {c('newPosts')}</span>}
          {regions?.pluginBadges}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {c('startedBy')} <UserRef user={thread.author} className="font-medium" />
        </p>
      </div>

      <span className="col-start-2 md:col-start-3 md:block md:text-right">
        <Tally value={thread.replyCount} label={c('replies')} />
        <span className="ms-3 md:hidden">
          <Tally value={thread.viewCount} label={c('views')} />
        </span>
      </span>

      <span className="hidden md:block md:text-right">
        <Tally value={thread.viewCount} label={c('views')} />
      </span>

      <div className="col-start-2 min-w-0 text-xs text-muted-foreground md:col-start-5">
        {thread.lastPost === null ? (
          <span className={MICRO}>{c('noRepliesYet')}</span>
        ) : (
          <>
            <a
              href={thread.lastPost.href}
              className={`block font-semibold text-foreground ${LINK}`}
            >
              {c('latestReply')}
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
