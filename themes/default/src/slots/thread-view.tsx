import { Badge, buttonVariants } from '@meith/ui'
import type { ThreadViewModel } from '@meith/theme-kit'

import { Counts, MUTED_LINK, PAGE_BODY, Prefix } from '../shared'

/**
 * A thread page (F31).
 *
 * ## Reply is the page's one filled control, and it is at both ends
 *
 * It appears once in the header, where somebody who arrived to answer will look,
 * and the reader who has just finished fifty posts gets the quick-reply island
 * (or, when they may not reply, nothing — no disabled box, no sign-in nag where
 * a composer would be). A second "Reply" button below the posts was tried and
 * removed: with the island rendered it is a duplicate control two inches from a
 * text area, and without the island it is the *only* way to reply, which is
 * exactly when it must not be a repeat of something scrolled off the screen.
 *
 * ## The thread's state is stated once, at the top
 *
 * `isLocked` matters most *before* somebody writes a reply, not after — and the
 * previous version of this slot showed thread state nowhere at all, so a member
 * could read a locked thread, press reply, compose an answer and be refused by
 * the composer. The badges are the same ones the listing uses, from the same
 * tokens, so the row somebody clicked and the page they landed on agree.
 */
export function ThreadView({ thread, forum, replyHref, markReadAction, regions }: ThreadViewModel) {
  return (
    <div className={PAGE_BODY}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <a href={forum.href} className={`text-sm ${MUTED_LINK}`}>
            {forum.label}
          </a>

          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-balance">
            {thread.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {thread.prefix !== null && <Prefix prefix={thread.prefix} />}
            {thread.isSticky && <Badge tone="pinned">Pinned</Badge>}
            {thread.isLocked && <Badge tone="locked">Locked — no new replies</Badge>}
            {thread.isMoved && <Badge tone="moved">Moved</Badge>}

            <Counts
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
                Mark read
              </button>
            </form>
          )}
          {replyHref !== null && (
            <a href={replyHref} className={buttonVariants({ variant: 'primary' })}>
              Reply
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">{regions.posts}</div>

      {regions.pagination}
      {regions.quickReply}
    </div>
  )
}
