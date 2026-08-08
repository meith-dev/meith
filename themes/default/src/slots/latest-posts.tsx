import { Card, CardContent, CardHeader, CardTitle, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'
import type { LatestPostsModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

/**
 * The newest posts on the board.
 *
 * The companion to `LatestThreads`, and the difference between them is the
 * whole reason there are two: that one is what has been *started*, this is what
 * is being *said*. A board with three busy threads and no new ones shows an
 * unchanging list up there and a moving one here, which is an accurate picture
 * of that board.
 *
 * ## The excerpt is two lines, clamped, and it is plain text
 *
 * `excerpt` arrives flattened out of the post's Markdown source — no markup,
 * ever, which is what makes it safe to render as text here rather than
 * something a theme has to sanitise. Clamped rather than truncated with an
 * ellipsis in the model, so the cut lands on a rendered line rather than at a
 * character count guessed against a column width nobody knows here.
 *
 * ## The link is the thread title, and it goes to the post
 *
 * A post has no title of its own; the thread's is the only name a reader can
 * recognise. The href is the post's permalink, so following it lands on the
 * reply that is quoted underneath rather than at the top of a thread whose
 * fortieth page it was on.
 */
export function LatestPosts({ posts, capturedAt }: LatestPostsModel) {
  return (
    <Card aria-labelledby="latest-posts-heading">
      <CardHeader>
        <CardTitle id="latest-posts-heading">Latest posts</CardTitle>
        <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
          As of <Stamp at={capturedAt} />
        </p>
      </CardHeader>

      {posts.length === 0 ? (
        <Empty className="py-6">
          <EmptyTitle>Nothing said yet</EmptyTitle>
          <EmptyDescription>The newest posts you can see will appear here.</EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {posts.map((post) => (
              <li key={post.href} className="flex flex-col gap-0.5 px-4 py-2">
                <a
                  href={post.href}
                  className={`truncate text-sm font-medium text-foreground ${LINK}`}
                >
                  {post.threadTitle}
                </a>

                {post.excerpt !== '' && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
                )}

                <p className="truncate text-xs text-muted-foreground">
                  <UserRef user={post.author} className="font-normal" />
                  {' in '}
                  <a href={post.community.href} className={MUTED_LINK}>
                    {post.community.label}
                  </a>
                  {' · '}
                  <Stamp at={post.postedAt} />
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
