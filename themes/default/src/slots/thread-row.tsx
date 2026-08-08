import { Badge } from '@meith/ui'
import type { ThreadRowSlotModel } from '@meith/theme-kit'

import { Counts, LINK, Prefix, ReadSpacer, Stamp, UnreadDot, UserRef } from '../shared'

/**
 * One thread in a listing (F30).
 *
 * The same column shape as `ForumRow`, on purpose: a member moves from the
 * index into a forum and the columns do not move under them. Markers, subject,
 * counters, then the last reply — and the markers are a column of their own at
 * every width, so a row that stacks on a phone keeps its three lines on one
 * left edge. See `ForumRow` for what that was fixing.
 *
 * ## The states a thread can be in are all rendered, and all in words
 *
 * `isSticky`, `isLocked` and `isMoved` are three separate booleans in the model
 * and the previous version of this slot rendered two of them — a moved thread,
 * which is a redirect stub pointing somewhere else entirely, looked exactly like
 * an ordinary thread with no replies. That is worse than a missing badge: it is
 * a row that lies about where its link goes.
 *
 * Each state is a `Badge` whose tone comes from the token that already means it
 * (`--thread-pinned`, `--thread-locked`, `--thread-moved`), so a board that
 * restyles one restyles every place it appears — and each badge says the word,
 * because a reader who cannot separate amber from rust still has to be able to
 * tell a pinned thread from a locked one.
 *
 * ## The prefix keeps the colour its operator chose
 *
 * `PrefixModel.token` is a token *name* out of the database, and the previous
 * version rendered every prefix in the same grey. See `prefixTone` in
 * `../shared` for why the mapping has to be a literal table rather than string
 * interpolation — Tailwind generates classes from source text, so a computed
 * class name is simply a class that does not exist.
 */
export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li
      data-unread={thread.isUnread ? '' : undefined}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/60 md:grid-cols-[auto_minmax(0,1fr)_9rem_14rem] md:items-center md:gap-x-4"
    >
      <span className="flex items-start gap-2">
        {/*
          F52's checkbox. `form` points at the moderation bar the page renders
          below the listing, so this control belongs to that form without this
          row being inside it — which it cannot be, because the listing already
          contains a mark-read form and browsers do not nest forms.
        */}
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
              {/*
                "Latest reply" rather than the thread's title again: this column
                sits beside that exact title, and repeating it is a link whose
                text tells a screen-reader user nothing about where it goes —
                which is different from where the title beside it goes.
              */}
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
