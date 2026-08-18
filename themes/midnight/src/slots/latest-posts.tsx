import type { LatestPostsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function LatestPosts({ posts, capturedAt, copy }: LatestPostsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.latestPosts.${key}`)

  return (
    <section aria-labelledby="latest-posts-heading" className="border border-border">
      <h2
        id="latest-posts-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        {c('heading')}
      </h2>

      {posts.length === 0 ? (
        <p className="px-3 py-2 font-mono text-xs text-muted-foreground">{c('empty')}</p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {posts.map((post) => (
            <li key={post.href} className="px-3 py-1.5">
              <a href={post.href} className="block truncate text-primary hover:underline">
                {post.threadTitle}
              </a>
              <p className="truncate text-muted-foreground">
                <a href={post.forum.href} className="hover:text-foreground">
                  {post.forum.label}
                </a>
                {' · '}
                <UserRef user={post.author} className="hover:text-foreground" />
                {' · '}
                <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time>
              </p>
              {post.excerpt !== '' && (
                <p className="line-clamp-2 text-muted-foreground">{post.excerpt}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        {c('asOf')} <time dateTime={capturedAt.iso}>{capturedAt.label}</time>
      </p>
    </section>
  )
}
