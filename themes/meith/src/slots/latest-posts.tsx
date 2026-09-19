import type { LatestPostsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { EDITORIAL_RULE, Label, META, NUMERIC, QUIET_LINK, RULE, Stamp, UserRef } from '../shared'

export function LatestPosts({ posts, capturedAt, copy }: LatestPostsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.latestPosts.${key}`)

  return (
    <section aria-labelledby="latest-posts-heading" className={`${EDITORIAL_RULE} pt-4`}>
      <div className="flex items-baseline justify-between gap-4">
        <Label as="h2" id="latest-posts-heading">
          {c('heading')}
        </Label>
        <p className={`${META} ${NUMERIC} text-xs`}>
          {c('asOf')} <Stamp at={capturedAt} />
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="py-6">
          <p className="text-[0.95rem] font-medium text-foreground">{c('nothingYet')}</p>
          <p className={`${META} mt-1`}>{c('emptyDescription')}</p>
        </div>
      ) : (
        <ul className="mt-3">
          {posts.map((post) => (
            <li key={post.href} className={`${RULE} flex flex-col gap-0.5 py-3`}>
              <a
                href={post.href}
                className={`truncate text-[0.9rem] font-medium text-foreground ${QUIET_LINK}`}
              >
                {post.threadTitle}
              </a>

              {post.excerpt !== '' && (
                <p className={`${META} line-clamp-2 text-xs`}>{post.excerpt}</p>
              )}

              <p className={`${META} truncate text-xs`}>
                <UserRef user={post.author} className="font-normal text-muted-foreground" />{' '}
                {c('in')}{' '}
                <a href={post.forum.href} className={QUIET_LINK}>
                  {post.forum.label}
                </a>{' '}
                <span aria-hidden="true" className="text-input">
                  {c('dot')}
                </span>{' '}
                <Stamp at={post.postedAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
