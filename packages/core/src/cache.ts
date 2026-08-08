/**
 * F10 — cache tags. Every tag name in the system is spelled exactly once, here.
 *
 * The failure this prevents: a writer invalidating `"community-tree"` while a reader
 * cached under `"communityTree"`, producing stale data that no test catches because
 * both strings are individually plausible. Tag builders are functions so the
 * parameterised forms cannot drift either.
 */

import type { CacheDriver } from "./ports"

export const CacheTags = {
  /** The whole community tree (structure, ordering, per-community flags). */
  communityTree: () => "community-tree",
  /** The entire settings set — read as one unit, so cached as one unit. */
  settings: () => "settings",
  /** Resolved theme tokens/branding for one theme key. */
  theme: (key: string) => `theme:${key}`,
  /**
   * F71's smilies and custom directives, read as one unit by the render path.
   *
   * F10 declared this as `smilies` and nothing ever read it. It is broader than
   * that name now and renamed to say so: a custom tag and a smiley are edited on
   * the same screen, compiled into the same object, and stamped onto a stored
   * render as one revision — so one tag is the honest granularity, and two would
   * be two chances to invalidate the wrong half.
   */
  markdownVocabulary: () => "markdown-vocabulary",
  prefixes: () => "prefixes",
  /**
   * F71's word filters. Read on the render path, so a stale set is visible on
   * every thread page until it is cleared.
   */
  wordFilters: () => "word-filters",
  /** Board-wide statistics shown on the index. */
  boardStats: () => "board-stats",
  /** One community's metadata and counters. */
  community: (communityId: number) => `community:${communityId}`,
  /** One thread's metadata and counters. */
  thread: (threadId: number) => `thread:${threadId}`,
  /** Public profile of one user. */
  user: (userId: number) => `user:${userId}`,
  /** Group definitions and their permission defaults. */
  groups: () => "groups",
  /**
   * Bumped whenever any permission input changes; participates in the
   * `permission_version` scheme so resolved actors invalidate en masse (F20).
   */
  permissions: () => "permissions",
} as const

export type CacheTag = ReturnType<(typeof CacheTags)[keyof typeof CacheTags]>

/**
 * Anything that must NOT be cached per-actor. Exported for the lint rule and for
 * documentation: these are the tags that describe *global* data only.
 *
 * Invariant 3: never cache a response that varies by actor. If a value depends on
 * the viewer, it does not belong under any of these tags.
 */
export const GLOBAL_TAGS: readonly string[] = [
  CacheTags.communityTree(),
  CacheTags.settings(),
  CacheTags.markdownVocabulary(),
  CacheTags.prefixes(),
  CacheTags.wordFilters(),
  CacheTags.boardStats(),
  CacheTags.groups(),
  CacheTags.permissions(),
]

export interface CachedGlobalOptions {
  /** Stable cache key parts. Must not include anything actor-derived. */
  key: readonly (string | number)[]
  tags: readonly string[]
  /** Seconds. Omit for indefinite caching governed purely by tag invalidation. */
  revalidate?: number
}

/**
 * ASCII Unit Separator — the control character whose whole purpose is
 * delimiting fields.
 *
 * Written as an escape rather than a raw byte: a literal control character in
 * source is invisible in every editor, diff and code review. It cannot appear
 * in a slug, an id or a theme key, so no legitimate key part can smuggle one
 * in and forge a collision.
 */
const KEY_SEPARATOR = '\u001f'

/**
 * Build the cache key, rejecting parts that would let two different reads
 * collide. `['community', '1:2']` and `['community:1', '2']` must not produce the same
 * key — a collision here serves one community's data under another's identity.
 */
export function globalCacheKey(parts: readonly (string | number)[]): string {
  if (parts.length === 0) {
    throw new Error('A cache key needs at least one part.')
  }
  return parts
    .map((part) => {
      const text = String(part)
      if (text.includes(KEY_SEPARATOR)) {
        throw new Error(`Cache key part contains the reserved separator: ${text}`)
      }
      return text
    })
    .join(KEY_SEPARATOR)
}

/**
 * Read-through cache for **global** data (F10).
 *
 * The driver is passed in rather than resolved from a module-level singleton:
 * `@meith/core` must not reach for infrastructure, and an explicit parameter is
 * what lets a test hand this a `MemoryCache` and assert the load function ran
 * exactly once.
 *
 * The name is the contract. Everything cached through here is visible to every
 * viewer, so it must not vary by actor — invariant 9, and the reason a cached
 * permission-filtered page is how private communities leak. There is no runtime check
 * that can prove a value is actor-independent (a tag cannot tell you what went
 * into the value), so this enforces the two things it *can*:
 *
 *  - at least one tag, because an entry nothing can invalidate is a stale read
 *    waiting to happen;
 *  - a non-colliding key.
 *
 * The rest is held by the `F10 no-request-state-in-cache` guard, which fails the
 * build if a cached region reads cookies, headers or the actor.
 */
export async function cachedGlobal<T>(
  cache: CacheDriver,
  options: CachedGlobalOptions,
  load: () => Promise<T>,
): Promise<T> {
  if (options.tags.length === 0) {
    throw new Error(
      'cachedGlobal requires at least one tag; an entry with no tag can never be invalidated.',
    )
  }

  const key = globalCacheKey(options.key)

  const hit = await cache.get<T>(key)
  if (hit !== undefined) return hit

  const value = await load()

  /*
   * `undefined` is not stored: the driver contract uses it to mean "miss", so a
   * cached undefined would re-run the loader every time anyway — and silently,
   * which is worse than not caching it.
   */
  if (value !== undefined) {
    await cache.set(key, value, {
      tags: options.tags,
      ...(options.revalidate === undefined ? {} : { ttlSeconds: options.revalidate }),
    })
  }
  return value
}
