import type { LatestPostsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Circle, MUTED_LINK, NUMERIC, Rail, Stamp, UserRef } from '../shared'

export function LatestPosts({ posts, capturedAt, copy }: LatestPostsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.latestPosts.${key}`)

  return (
    <Rail
      title={c('title')}
      titleId="latest-posts-heading"
      action={
        <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
          <Stamp at={capturedAt} />
        </span>
      }
    >
      {posts.length === 0 ? (
        <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">{c('empty')}</p>
      ) : (
        <ul className="px-1 pt-1 pb-1">
          {posts.map((post) => (
            <li
              key={post.href}
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <div className="flex items-start gap-2.5">
                <Circle name={post.author.username} size={32} className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  <a
                    href={post.href}
                    className="line-clamp-2 text-sm font-semibold text-foreground hover:underline"
                  >
                    {post.threadTitle}
                  </a>

                  {post.excerpt !== '' && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {post.excerpt}
                    </p>
                  )}

                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <UserRef user={post.author} className="text-xs font-medium" />
                    {` ${c('in')} `}
                    <a href={post.forum.href} className={MUTED_LINK}>
                      {post.forum.label}
                    </a>
                    {' · '}
                    <Stamp at={post.postedAt} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Rail>
  )
}
