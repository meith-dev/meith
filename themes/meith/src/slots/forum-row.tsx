import type { ForumRowSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  Arrow,
  Counts,
  ITEM_RULE,
  ITEM_TITLE,
  META,
  QUIET_LINK,
  ROW_HOVER,
  Stamp,
  UnreadMark,
  UserRef,
} from '../shared'

export function ForumRow({ forum, copy }: ForumRowSlotModel & { copy: SlotCopy }) {
  const isLink = forum.type === 'link'

  const c = (key: string) => fromSlotCopy(copy, `meith.forumRow.${key}`)

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className={`group relative grid gap-x-6 gap-y-2 py-4 ${ITEM_RULE} ${ROW_HOVER} ${
        isLink ? '' : '@3xl/card:grid-cols-[minmax(0,1fr)_9rem_15rem] @3xl/card:items-baseline'
      }`}
    >
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className={`${ITEM_TITLE} flex items-baseline gap-2.5`}>
          {forum.isUnread && <UnreadMark className="translate-y-[-0.1em]" />}
          <a
            href={forum.href}
            className={`${QUIET_LINK} after:absolute after:inset-0 after:content-['']`}
          >
            {forum.title}
            <Arrow />
          </a>
          {forum.isUnread && <span className="sr-only"> {c('newPosts')}</span>}
        </p>

        {forum.description !== null && (
          <p className={`${META} mt-1 max-w-[42rem]`}>{forum.description}</p>
        )}

        {forum.subforums.length > 0 && (
          <p className={`${META} relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1`}>
            <span className="sr-only">{c('subforums')}</span>
            {forum.subforums.map((sub, index) => (
              <span key={sub.href} className="flex items-center gap-x-2">
                {index > 0 && (
                  <span aria-hidden="true" className="text-input">
                    {c('slash')}
                  </span>
                )}
                <a href={sub.href} className={`font-medium text-foreground ${QUIET_LINK}`}>
                  {sub.label}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>

      {!isLink && (
        <>
          <Counts
            className="@3xl/card:flex-col @3xl/card:gap-y-0"
            items={[
              {
                label: c('threadsLabel'),
                value: forum.threadCount,
                one: c('thread.one'),
                many: c('thread.other'),
              },
              {
                label: c('postsLabel'),
                value: forum.postCount,
                one: c('post.one'),
                many: c('post.other'),
              },
            ]}
          />

          <div
            className={`${META} relative z-10 min-w-0 @3xl/card:border-l @3xl/card:border-border @3xl/card:pl-5`}
          >
            {forum.lastPost === null ? (
              <span className="text-forum-read">{c('noPostsYet')}</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className={`block truncate font-medium text-foreground ${QUIET_LINK}`}
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span className="block truncate">
                  <UserRef
                    user={forum.lastPost.author}
                    className="font-normal text-muted-foreground"
                  />{' '}
                  <span aria-hidden="true" className="text-input">
                    {c('dot')}
                  </span>{' '}
                  <Stamp at={forum.lastPost.at} />
                </span>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}
