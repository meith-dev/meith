import type { SlotCopy, ThreadRowSlotModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MICRO, NUMERIC, ReadPip, Stamp, UserRef } from '../shared'

const TAG = 'border px-1.5 py-px font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em]'

export function ThreadRow({
  thread,
  select,
  regions,
  copy,
}: ThreadRowSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.threadRow.${key}`)

  const hidden = thread.visibility === 'deleted' || thread.visibility === 'unapproved'
  const tint = thread.visibility === 'deleted' ? 'bg-thread-deleted/10' : 'bg-thread-unapproved/10'

  return (
    <tr
      data-visibility={hidden ? thread.visibility : undefined}
      className={`border-t border-border align-top hover:bg-secondary/50 ${hidden ? tint : ''}`}
    >
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-2">
          {select !== null && (
            <label className="flex items-center">
              <span className="sr-only">{select.label}</span>
              <input
                type="checkbox"
                name={select.name}
                value={select.value}
                form={select.formId}
                className="size-3.5 accent-primary"
              />
            </label>
          )}

          <ReadPip unread={thread.isUnread} />

          {thread.prefix !== null && (
            <span className={`${TAG} border-primary/60 text-primary`}>{thread.prefix.label}</span>
          )}

          <a href={thread.href} className="font-medium text-foreground hover:text-primary">
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only">{c('newPosts')}</span>}

          {thread.isSticky && (
            <span className={`${TAG} border-thread-pinned/60 text-thread-pinned`}>
              {c('pinned')}
            </span>
          )}
          {thread.isLocked && (
            <span className={`${TAG} border-thread-locked/60 text-thread-locked`}>
              {c('locked')}
            </span>
          )}
          {thread.isMoved && (
            <span className={`${TAG} border-thread-moved/60 text-thread-moved`}>{c('moved')}</span>
          )}
          {thread.visibility === 'unapproved' && (
            <span className={`${TAG} border-thread-unapproved/60 text-thread-unapproved`}>
              {c('unapproved')}
            </span>
          )}
          {thread.visibility === 'deleted' && (
            <span className={`${TAG} border-thread-deleted/60 text-thread-deleted`}>
              {c('deleted')}
            </span>
          )}
          {regions?.pluginBadges}
        </div>

        <p className={`${MICRO} mt-1 normal-case`}>
          <span className="uppercase">{c('startedBy')}</span>{' '}
          <UserRef user={thread.author} className="hover:text-primary" />
        </p>
      </td>

      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-foreground`}>
        {thread.replyCount.label}
      </td>
      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-muted-foreground`}>
        {thread.viewCount.label}
      </td>

      <td className="hidden w-52 px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
        {thread.lastPost === null ? (
          <span className={MICRO}>{c('none')}</span>
        ) : (
          <a href={thread.lastPost.href} className="block hover:text-primary">
            <Stamp at={thread.lastPost.at} className="text-foreground" />
            <span className={`${MICRO} mt-0.5 block normal-case`}>
              {c('byPrefix')}
              <UserRef user={thread.lastPost.author} linked={false} />
            </span>
          </a>
        )}
      </td>
    </tr>
  )
}
