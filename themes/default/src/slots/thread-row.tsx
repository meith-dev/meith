import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, Badge } from '@meith/ui'

import { Figures, LINK, Prefix, Stamp, UnreadDot, UserRef } from '../shared'

export function ThreadRow({
  thread,
  select,
  regions,
  copy,
}: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/8' : 'bg-thread-unapproved/8'

  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      data-visibility={hidden ? thread.visibility : undefined}
      className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5 @3xl/card:grid-cols-[auto_minmax(0,1fr)_6rem_13rem] @3xl/card:items-center @3xl/card:gap-x-5 ${hidden ? tint : ''}`}
    >
      <span className="flex items-center gap-2.5">
        {select !== null && (
          <label className="flex shrink-0 items-center">
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
          <Avatar src={null} name={thread.author.username} size={36} className="rounded-full" />
          {thread.isUnread && <UnreadDot className="absolute -top-0.5 -right-0.5" />}
        </span>
      </span>

      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
          {thread.isSticky && <Badge tone="pinned">{c('pinned')}</Badge>}
          {thread.isLocked && <Badge tone="locked">{c('locked')}</Badge>}
          {thread.isMoved && <Badge tone="moved">{c('moved')}</Badge>}
          {thread.visibility === 'unapproved' && <Badge tone="unapproved">{c('unapproved')}</Badge>}
          {thread.visibility === 'deleted' && <Badge tone="deleted">{c('deleted')}</Badge>}

          <a
            href={thread.href}
            className={
              (thread.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
              ` text-[0.9375rem] ${LINK}`
            }
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only"> {c('newPosts')}</span>}
          {regions?.pluginBadges}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {c('startedBy')} <UserRef user={thread.author} className="font-normal" />
        </p>
      </div>

      <div className="col-start-2 flex min-w-0 flex-col gap-y-1 text-xs text-muted-foreground @3xl/card:contents">
        <Figures
          className="@3xl/card:col-start-3 @3xl/card:justify-self-end"
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

        <div className="order-first flex min-w-0 max-w-full flex-wrap gap-x-1 @3xl/card:order-none @3xl/card:col-start-4 @3xl/card:block @3xl/card:border-l @3xl/card:border-border @3xl/card:pl-5">
          {thread.lastPost === null ? (
            <span className="text-thread-moved">{c('noRepliesYet')}</span>
          ) : (
            <>
              <a
                href={thread.lastPost.href}
                className={`font-medium text-foreground @3xl/card:block ${LINK}`}
              >
                {c('latestReply')}
              </a>
              <span className="@3xl/card:mt-0.5 @3xl/card:block @3xl/card:truncate">
                {c('by')} <UserRef user={thread.lastPost.author} className="font-normal" />{' '}
                {c('dot')} <Stamp at={thread.lastPost.at} />
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
