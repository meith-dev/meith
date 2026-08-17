import type { CacheDriver } from './ports'

export const CacheTags = {
  forumTree: () => 'forum-tree',
  settings: () => 'settings',
  theme: (key: string) => `theme:${key}`,
  markdownVocabulary: () => 'markdown-vocabulary',
  prefixes: () => 'prefixes',
  wordFilters: () => 'word-filters',
  boardStats: () => 'board-stats',
  forum: (forumId: number) => `forum:${forumId}`,
  thread: (threadId: number) => `thread:${threadId}`,
  user: (userId: number) => `user:${userId}`,
  groups: () => 'groups',
} as const

export type CacheTag = ReturnType<(typeof CacheTags)[keyof typeof CacheTags]>

export const GLOBAL_TAGS: readonly string[] = [
  CacheTags.forumTree(),
  CacheTags.settings(),
  CacheTags.markdownVocabulary(),
  CacheTags.prefixes(),
  CacheTags.wordFilters(),
  CacheTags.boardStats(),
  CacheTags.groups(),
]

export interface CachedGlobalOptions {
  key: readonly (string | number)[]
  tags: readonly string[]
  revalidate?: number
}

const KEY_SEPARATOR = '\u001f'

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

  if (value !== undefined) {
    await cache.set(key, value, {
      tags: options.tags,
      ...(options.revalidate === undefined ? {} : { ttlSeconds: options.revalidate }),
    })
  }
  return value
}
