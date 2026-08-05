import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * One thread, as a table row.
 *
 * The state flags are **words**, not icons and not colours: "pinned", "locked",
 * "moved" are read by everybody, and a board where locked threads are only a
 * shade of red is a board where half the readers click reply on them.
 *
 * The F52 checkbox keeps its `form` attribute. That association by id is what
 * makes bulk moderation work with scripting off — the row cannot be inside the
 * moderation form, because the listing already contains a mark-read form and
 * nested forms are not a thing browsers parse.
 */
export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <tr className="border-t border-border align-top odd:bg-card even:bg-muted/40">
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          {select !== null && (
            <label className="flex items-center">
              <span className="sr-only">{select.label}</span>
              <input
                type="checkbox"
                name={select.name}
                value={select.value}
                form={select.formId}
                className="size-3.5"
              />
            </label>
          )}
          {thread.isUnread && (
            <span className="size-1.5 shrink-0 bg-forum-unread" aria-hidden="true" />
          )}
          {thread.prefix !== null && (
            <span className="border border-border px-1 font-mono text-xs text-secondary-foreground">
              {thread.prefix.label}
            </span>
          )}
          <a href={thread.href} className="font-medium hover:text-primary">
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only">(new posts)</span>}
          {thread.isSticky && <span className="font-mono text-xs text-thread-pinned">pinned</span>}
          {thread.isLocked && <span className="font-mono text-xs text-thread-locked">locked</span>}
          {thread.isMoved && <span className="font-mono text-xs text-thread-moved">moved</span>}
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          <UserRef user={thread.author} className="hover:text-foreground" />
        </p>
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {thread.replyCount}
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {thread.viewCount}
      </td>
      <td className="w-56 px-3 py-2 text-xs text-muted-foreground">
        {thread.lastPost === null ? (
          <span className="text-forum-read">—</span>
        ) : (
          <a href={thread.lastPost.href} className="hover:text-primary">
            <time dateTime={thread.lastPost.at.iso}>{thread.lastPost.at.label}</time>
            {/* Not a link: this cell is already wrapped in one. */}
            <span className="block">
              by <UserRef user={thread.lastPost.author} linked={false} />
            </span>
          </a>
        )}
      </td>
    </tr>
  )
}
