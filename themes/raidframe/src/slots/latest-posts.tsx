import type { LatestPostsModel } from '@meith/theme-kit'

import { Frame, MICRO, PanelHead, Stamp, UserRef } from '../shared'

export function LatestPosts({ posts, capturedAt }: LatestPostsModel) {
  return (
    <Frame aria-labelledby="latest-posts-heading">
      <PanelHead id="latest-posts-heading" title="Latest posts" />

      {posts.length === 0 ? (
        <p className={`${MICRO} px-3 py-2.5`}>nothing said yet</p>
      ) : (
        <ul className="divide-y divide-border">
          {posts.map((post) => (
            <li key={post.href} className="px-3 py-2 hover:bg-secondary/50">
              <a
                href={post.href}
                className="block truncate text-xs text-foreground hover:text-primary"
              >
                {post.threadTitle}
              </a>
              <p className={`${MICRO} mt-0.5 truncate normal-case`}>
                <a href={post.forum.href} className="uppercase hover:text-primary">
                  {post.forum.label}
                </a>
                <span className="text-border">{' | '}</span>
                <UserRef user={post.author} className="hover:text-primary" />
              </p>
              <p className={`${MICRO} truncate normal-case`}>
                <Stamp at={post.postedAt} />
              </p>
              {post.excerpt !== '' && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
        <span className="uppercase">as of</span> <Stamp at={capturedAt} />
      </p>
    </Frame>
  )
}
