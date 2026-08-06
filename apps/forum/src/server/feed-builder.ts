import 'server-only'

import type { FeedPost, FeedThread } from '@meith/db'

import { summarise, type FeedChannel, type FeedEntry } from '@/view/feed'

import { absolute, origin } from './syndication'

function tagId(kind: 'thread' | 'post', id: number): string {
  const host = origin().replace(/^https?:\/\//, '')
  return `tag:${host},2026:${kind}/${id}`
}

export function threadEntry(thread: FeedThread): FeedEntry {
  return {
    id: tagId('thread', thread.threadId),
    title: thread.title,
    href: absolute(`/thread/${thread.threadId}-${thread.slug}`),
    author: thread.authorUsername,
    published: thread.createdAt,
    updated: thread.lastPostAt,
    summary: summarise(thread.excerptSource),
  }
}

export function postEntry(post: FeedPost): FeedEntry {
  return {
    id: tagId('post', post.postId),
    title: post.threadTitle,
    href: absolute(
      `/thread/${post.threadId}-${post.threadSlug}?post=${post.postId}#post-${post.postId}`,
    ),
    author: post.authorUsername,
    published: post.createdAt,
    updated: post.createdAt,
    summary: summarise(post.messageSource),
  }
}

export function channel(input: {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly selfPath: string
  readonly entries: readonly FeedEntry[]
  readonly now: Date
}): FeedChannel {
  return {
    title: input.title,
    description: input.description,
    href: absolute(input.path),
    selfHref: absolute(input.selfPath),
    updated: input.entries[0]?.updated ?? input.now,
    entries: input.entries,
  }
}
