import type { PluginData } from '@meith/plugin-kit'

import type { DisplayAward } from './awards'

type DisplayCache = Map<
  number,
  { until: number; limit: number; rows: Promise<readonly DisplayAward[]> }
>
const CACHE_KEY = Symbol.for('@meith/plugin-awards.display')
const shared = globalThis as typeof globalThis & { [CACHE_KEY]?: DisplayCache }
const cache: DisplayCache = shared[CACHE_KEY] ?? new Map()
shared[CACHE_KEY] = cache

export function clearDisplay(userId?: number): void {
  if (userId === undefined) cache.clear()
  else cache.delete(userId)
}

export function cachedAwards(
  data: PluginData,
  userId: number,
  limit: number,
): Promise<readonly DisplayAward[]> {
  const found = cache.get(userId)
  if (found !== undefined && found.until > Date.now() && found.limit === limit) return found.rows
  cache.delete(userId)
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!)
  const entry = { until: Date.now() + 60_000, limit, rows: displayAwards(data, userId, limit + 1) }
  cache.set(userId, entry)
  void entry.rows.catch(() => {
    if (cache.get(userId) === entry) cache.delete(userId)
  })
  return entry.rows
}

export async function displayAwards(
  data: PluginData,
  userId: number,
  limit: number,
): Promise<readonly DisplayAward[]> {
  return data.query<DisplayAward>(
    `select a.*, count(*)::int as count, count(*) over ()::int as total
    from plugin_awards_grant g join plugin_awards_award a on a.id = g.award_id
    where g.user_id = $1 and a.archived_at is null
    group by a.id order by a.display_order, a.id limit $2`,
    [userId, limit],
  )
}
