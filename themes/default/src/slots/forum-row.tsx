import type { ForumRowSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Figures, LINK, Stamp, Tile, UserRef } from '../shared'

function LinkGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 3.5h6v6M12.5 3.5 4 12" />
    </svg>
  )
}

export function ForumRow({ forum, copy }: ForumRowSlotModel & { copy: SlotCopy }) {
  const isLink = forum.type === 'link'

  const c = (key: string) => fromSlotCopy(copy, `default.forumRow.${key}`)

  return (
    <li
      data-unread={forum.isUnread ? '' : undefined}
      className={
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5' +
        (isLink ? '' : ' md:grid-cols-[auto_minmax(0,1fr)_9rem_16rem] md:items-center md:gap-x-5')
      }
    >
      <Tile label={forum.title} unread={forum.isUnread} className="mt-0.5 md:mt-0">
        {isLink ? <LinkGlyph /> : undefined}
      </Tile>

      <div className="min-w-0">
        <a
          href={forum.href}
          className={
            (forum.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground') +
            ` text-[0.9375rem] ${LINK}`
          }
        >
          {forum.title}
        </a>
        {forum.isUnread && <span className="sr-only"> {c('newPosts')}</span>}

        {forum.description !== null && (
          <p className="mt-0.5 text-sm text-muted-foreground">{forum.description}</p>
        )}

        {forum.subforums.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="sr-only">{c('subforums')}</span>
            {forum.subforums.map((sub) => (
              <a
                key={sub.href}
                href={sub.href}
                className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </div>

      {!isLink && (
        <div className="col-start-2 flex min-w-0 flex-col gap-y-1 text-xs text-muted-foreground md:contents">
          <Figures
            className="md:col-start-3 md:justify-self-end"
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

          <div className="order-first flex min-w-0 max-w-full flex-wrap gap-x-1 md:order-none md:col-start-4 md:block md:border-l md:border-border md:pl-5">
            {forum.lastPost === null ? (
              <span className="text-forum-read">{c('noPostsYet')}</span>
            ) : (
              <>
                <a
                  href={forum.lastPost.href}
                  className={`max-w-full truncate font-medium text-foreground md:block ${LINK}`}
                >
                  {forum.lastPost.threadTitle}
                </a>
                <span className="md:mt-0.5 md:block md:truncate">
                  {c('by')} <UserRef user={forum.lastPost.author} className="font-normal" />{' '}
                  {c('dot')} <Stamp at={forum.lastPost.at} />
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
