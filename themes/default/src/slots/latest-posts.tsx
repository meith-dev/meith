import type { LatestPostsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  Avatar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

export function LatestPosts({ posts, capturedAt, copy }: LatestPostsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.latestPosts.${key}`)

  return (
    <Card aria-labelledby="latest-posts-heading" className="rounded-xl">
      <CardHeader className="bg-card">
        <CardTitle id="latest-posts-heading" className="text-sm">
          {c('heading')}
        </CardTitle>
        <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
          {c('asOf')} <Stamp at={capturedAt} />
        </p>
      </CardHeader>

      {posts.length === 0 ? (
        <Empty className="py-6">
          <EmptyTitle>{c('nothingYet')}</EmptyTitle>
          <EmptyDescription>{c('emptyDescription')}</EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {posts.map((post) => (
              <li
                key={post.href}
                className="flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
              >
                <Avatar
                  src={null}
                  name={post.author.username}
                  size={28}
                  className="mt-0.5 rounded-full"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                    <UserRef user={post.author} className="font-normal" /> {c('in')}{' '}
                    <a href={post.forum.href} className={MUTED_LINK}>
                      {post.forum.label}
                    </a>{' '}
                    {c('dot')} <Stamp at={post.postedAt} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
