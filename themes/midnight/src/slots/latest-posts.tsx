import type { LatestPostsModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * The newest posts, as a log.
 *
 * The companion to `LatestThreads` and the same line shape, with the excerpt on
 * a second line because it is the only thing here a reader is scanning *for* —
 * "what is being said" is not answerable from a thread title they have already
 * seen five times today.
 *
 * `excerpt` is plain text, flattened out of the post's Markdown source by the
 * app. Nothing in it is markup, which is what makes it safe to render as the
 * text it is.
 */
export function LatestPosts({ posts, capturedAt }: LatestPostsModel) {
  return (
    <section aria-labelledby="latest-posts-heading" className="border border-border">
      <h2
        id="latest-posts-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        Latest posts
      </h2>

      {posts.length === 0 ? (
        <p className="px-3 py-2 font-mono text-xs text-muted-foreground">nothing said yet</p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {posts.map((post) => (
            <li key={post.href} className="px-3 py-1.5">
              <a href={post.href} className="text-primary hover:underline">
                {post.threadTitle}
              </a>
              <span className="text-muted-foreground">
                {' · '}
                <a href={post.community.href} className="hover:text-foreground">
                  {post.community.label}
                </a>
                {' · '}
                <UserRef user={post.author} className="hover:text-foreground" />
                {' · '}
                <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time>
              </span>
              {post.excerpt !== '' && (
                <p className="line-clamp-2 text-muted-foreground">{post.excerpt}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        as of <time dateTime={capturedAt.iso}>{capturedAt.label}</time>
      </p>
    </section>
  )
}
