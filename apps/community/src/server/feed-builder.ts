import 'server-only'

/**
 * F76 — turning rows into a feed channel.
 *
 * The four feed routes differ only in what they read; the mapping from rows to
 * entries is one function per shape, here, so the board feed and the community feed
 * cannot drift in how they build an entry id or a permalink.
 *
 * ## Entry ids are not URLs
 *
 * `guid isPermaLink="false"` and an Atom `<id>` of the form
 * `tag:<host>,<date>:thread/<id>`. A reader keys "have I seen this" on the id,
 * so it must survive a thread being renamed — which changes its slug and
 * therefore its URL. Using the permalink as the id means every rename
 * re-notifies everybody who follows the board.
 */
import type { FeedPost, FeedThread } from '@meith/db'

import { summarise, type FeedChannel, type FeedEntry } from '@/view/feed'

import { absoluteTo } from './syndication'

/**
 * The three builders, bound to one origin.
 *
 * A factory rather than three functions that each look the origin up, because
 * the origin stopped being a synchronous environment read: it can come from the
 * `board.url` setting, which means a database. A fifty-entry feed that resolved
 * it per entry would ask the same question fifty times, and
 * `threads.map(threadEntry)` could not stay a `.map` at all.
 *
 * Taking it as an argument is what R2 asks for anyway. These are pure functions
 * over rows now — a test can build a channel for `https://board.example` with no
 * environment, no database and no request.
 */
export function feedFor(origin: string): {
  threadEntry: (thread: FeedThread) => FeedEntry
  postEntry: (post: FeedPost) => FeedEntry
  channel: (input: ChannelInput) => FeedChannel
} {
  const absolute = (path: string): string => absoluteTo(origin, path)

  /**
   * A stable, opaque entry id.
   *
   * The `tag:` scheme (RFC 4151) exists for exactly this: an identifier that is
   * globally unique, permanent, and obviously not a URL to fetch. The date is the
   * board's origin rather than the entry's, because the authority is the board.
   */
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
      /*
       * `updated` is the last post, `published` the thread's own creation. A
       * reader sorts on one and de-duplicates on the other, and collapsing them
       * makes a year-old thread with a new reply look like a year-old entry.
       */
      updated: thread.lastPostAt,
      summary: summarise(thread.excerptSource),
    }
  }

  function postEntry(post: FeedPost): FeedEntry {
    return {
      id: tagId('post', post.postId),
      /*
       * The thread's title, because that is what a reader recognises, and a post
       * has no title of its own. The permalink carries the anchor, so following
       * it lands on the post rather than the top of the thread.
       */
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
      /*
       * The newest entry's timestamp, not the clock. A feed whose
       * `lastBuildDate` moves on every request tells conditional-GET machinery
       * that something changed when nothing did, and a popular board answers a
       * lot of those requests.
       */
      updated: input.entries[0]?.updated ?? input.now,
      entries: input.entries,
    }
  }

  return { threadEntry, postEntry, channel }
}

/** The shape `channel` takes. Named so the factory's return type can state it. */
interface ChannelInput {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly selfPath: string
  readonly entries: readonly FeedEntry[]
  readonly now: Date
}
