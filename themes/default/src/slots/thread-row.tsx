import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Badge } from '@meith/ui'

import { Counts, LINK, Prefix, ReadSpacer, Stamp, UnreadDot, UserRef } from '../shared'

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
      className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 px-4 py-3 transition-colors hover:bg-muted/60 md:grid-cols-[auto_minmax(0,1fr)_9rem_14rem] md:items-center md:gap-x-4 ${hidden ? tint : ''}`}
    >
      <span className="flex items-start gap-2">
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
          {thread.isSticky && <Badge tone="pinned">{c('pinned')}</Badge>}
          {thread.isLocked && <Badge tone="locked">{c('locked')}</Badge>}
          {thread.isMoved && <Badge tone="moved">{c('moved')}</Badge>}
          {thread.visibility === 'unapproved' && <Badge tone="unapproved">{c('unapproved')}</Badge>}
          {thread.visibility === 'deleted' && <Badge tone="deleted">{c('deleted')}</Badge>}

          <a
            href={thread.href}
            className={
              (thread.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
              ` ${LINK}`
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

      <div className="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground md:contents">
        <Counts
          className="md:col-start-3 md:justify-end"
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

        <div className="flex min-w-0 max-w-full flex-wrap gap-x-1 md:col-start-4 md:block">
          {thread.lastPost === null ? (
            <span className="text-thread-moved">{c('noRepliesYet')}</span>
          ) : (
            <>
              <a
                href={thread.lastPost.href}
                className={`font-medium text-foreground md:block ${LINK}`}
              >
                {c('latestReply')}
              </a>
              <span className="md:mt-0.5 md:block md:truncate">
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
