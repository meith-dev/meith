import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { MICRO, NUMERIC, ReadPip, Stamp, UserRef } from '../shared'

const TAG = 'border px-1.5 py-px font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em]'

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <tr className="border-t border-border align-top hover:bg-secondary/50">
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
          {thread.isUnread && <span className="sr-only">(new posts)</span>}

          {thread.isSticky && (
            <span className={`${TAG} border-thread-pinned/60 text-thread-pinned`}>pinned</span>
          )}
          {thread.isLocked && (
            <span className={`${TAG} border-thread-locked/60 text-thread-locked`}>locked</span>
          )}
          {thread.isMoved && (
            <span className={`${TAG} border-thread-moved/60 text-thread-moved`}>moved</span>
          )}
        </div>

        <p className={`${MICRO} mt-1 normal-case`}>
          <span className="uppercase">started by</span>{' '}
          <UserRef user={thread.author} className="hover:text-primary" />
        </p>
      </td>

      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-foreground`}>
        {thread.replyCount}
      </td>
      <td className={`w-16 px-2 py-2.5 text-right text-xs ${NUMERIC} text-muted-foreground`}>
        {thread.viewCount}
      </td>

      <td className="hidden w-52 px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
        {thread.lastPost === null ? (
          <span className={MICRO}>—</span>
        ) : (
          <a href={thread.lastPost.href} className="block hover:text-primary">
            <Stamp at={thread.lastPost.at} className="text-foreground" />
            <span className={`${MICRO} mt-0.5 block normal-case`}>
              by <UserRef user={thread.lastPost.author} linked={false} />
            </span>
          </a>
        )}
      </td>
    </tr>
  )
}
