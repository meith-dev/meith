import 'server-only'

import type { FeedPost, FeedThread } from '@meith/db'
import type { CompiledWordFilter } from '@meith/markdown'

import { summarise, type FeedChannel, type FeedEntry } from '@/view/feed'
import { postLink } from '@/view/post-link'
import { filterWords } from '@/view/word-filter'

import { absoluteTo } from './syndication'

export function feedFor(
  origin: string,
  wordFilter: CompiledWordFilter | undefined,
): {
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
      summary: filterWords(summarise(thread.excerptSource), wordFilter),
    }
  }

  function postEntry(post: FeedPost): FeedEntry {
    return {
      id: tagId('post', post.postId),
      title: post.threadTitle,
      href: absolute(
        postLink(`/thread/${post.threadId}-${post.threadSlug}`, post.postId),
      ),
      author: post.authorUsername,
      published: post.createdAt,
      updated: post.createdAt,
      summary: filterWords(summarise(post.messageSource), wordFilter),
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
