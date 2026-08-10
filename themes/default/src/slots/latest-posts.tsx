import { Card, CardContent, CardHeader, CardTitle, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'
import type { LatestPostsModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

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
                  <a href={post.forum.href} className={MUTED_LINK}>
                    {post.forum.label}
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
