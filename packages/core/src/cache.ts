/**
 * F10 — cache tags. Every tag name in the system is spelled exactly once, here.
 *
 * The failure this prevents: a writer invalidating `"forum-tree"` while a reader
 * cached under `"forumTree"`, producing stale data that no test catches because
 * both strings are individually plausible. Tag builders are functions so the
 * parameterised forms cannot drift either.
 */

export const CacheTags = {
  /** The whole forum tree (structure, ordering, per-forum flags). */
  forumTree: () => "forum-tree",
  /** The entire settings set — read as one unit, so cached as one unit. */
  settings: () => "settings",
  /** Resolved theme tokens/branding for one theme key. */
  theme: (key: string) => `theme:${key}`,
  /** Global content collections rendered into posts. */
  smilies: () => "smilies",
  prefixes: () => "prefixes",
  /** Board-wide statistics shown on the index. */
  boardStats: () => "board-stats",
  /** One forum's metadata and counters. */
  forum: (forumId: number) => `forum:${forumId}`,
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
  CacheTags.forumTree(),
  CacheTags.settings(),
  CacheTags.smilies(),
  CacheTags.prefixes(),
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
