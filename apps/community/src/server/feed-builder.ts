import 'server-only'

import type { FeedPost, FeedThread } from '@meith/db'

import { summarise, type FeedChannel, type FeedEntry } from '@/view/feed'

import { absoluteTo } from './syndication'

export function feedFor(origin: string): {
  threadEntry: (thread: FeedThread) => FeedEntry
  postEntry: (post: FeedPost) => FeedEntry
  channel: (input: ChannelInput) => FeedChannel
} {
  const absolute = (path: string): string => absoluteTo(origin, path)

  const tagId = (kind: 'thread' | 'post', id: number): string => {
    const host = origin.replace(/^https?:\/\//, '')
    return `tag:${host},2026:${kind}/${id}`
  }

  function threadEntry(thread: FeedThread): FeedEntry {
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

  function postEntry(post: FeedPost): FeedEntry {
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

  function channel(input: ChannelInput): FeedChannel {
    return {
      title: input.title,
      description: input.description,
      href: absolute(input.path),
      selfHref: absolute(input.selfPath),
      updated: input.entries[0]?.updated ?? input.now,
      entries: input.entries,
    }
  }

  return { threadEntry, postEntry, channel }
}

interface ChannelInput {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly selfPath: string
  readonly entries: readonly FeedEntry[]
  readonly now: Date
}
