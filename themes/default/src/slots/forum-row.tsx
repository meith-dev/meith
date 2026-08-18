import type { ForumRowSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Counts, LINK, MUTED_LINK, ReadSpacer, Stamp, UnreadDot, UserRef } from '../shared'

export function ForumRow({ forum, copy }: ForumRowSlotModel & { copy: SlotCopy }) {
  const isLink = forum.type === 'link'

  const c = (key: string) => fromSlotCopy(copy, `default.forumRow.${key}`)

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className={
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/60' +
        (isLink ? '' : ' md:grid-cols-[auto_minmax(0,1fr)_9rem_15rem] md:items-center md:gap-x-4')
      }
    >
      {forum.isUnread ? <UnreadDot /> : <ReadSpacer />}

      <div className="min-w-0">
        <a
          href={forum.href}
          className={
            (forum.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
            ` ${LINK}`
          }
        >
          {forum.title}
        </a>
        {forum.isUnread && <span className="sr-only"> {c('newPosts')}</span>}

        {forum.description !== null && (
          <p className="mt-0.5 text-sm text-muted-foreground">{forum.description}</p>
        )}

        {forum.subforums.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c('subforums')}</span>
            {forum.subforums.map((sub) => (
              <a key={sub.href} href={sub.href} className={MUTED_LINK}>
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </div>

      {!isLink && (
        <>
          <Counts
            className="col-start-2 md:col-start-3 md:justify-end"
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

          <div className="col-start-2 min-w-0 text-xs text-muted-foreground md:col-start-4">
            {forum.lastPost === null ? (
              <span className="text-forum-read">{c('noPostsYet')}</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className={`block truncate font-medium text-foreground ${LINK}`}
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span className="mt-0.5 block truncate">
                  {c('by')} <UserRef user={forum.lastPost.author} className="font-normal" />{' '}
                  {c('dot')} <Stamp at={forum.lastPost.at} />
                </span>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}
