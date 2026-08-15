import { CacheTags } from '@meith/core'

export type CacheTagFactory = () => string

export const CLEARABLE_CACHES: Readonly<Record<string, CacheTagFactory>> = {
  forums: CacheTags.forumTree,
}

export function clearableTag(what: unknown): string | null {
  if (typeof what !== 'string') return null
  const factory = CLEARABLE_CACHES[what]
  return factory === undefined ? null : factory()
}
