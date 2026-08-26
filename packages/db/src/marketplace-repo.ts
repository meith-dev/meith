import { sql } from 'drizzle-orm'

import type {
  CachedMarketplace,
  MarketplaceCacheRepository,
  MarketplaceFeed,
} from '@meith/marketplace'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface Row {
  readonly feed: unknown
  readonly source_url: string | null
  readonly fetched_at: string | null
  readonly error: string | null
  readonly error_at: string | null
  readonly notified_updates: unknown
}

function toCached(row: Row | undefined): CachedMarketplace {
  if (row === undefined) {
    return { feed: null, sourceUrl: null, fetchedAt: null, error: null, errorAt: null }
  }

  return {
    feed: (row.feed as MarketplaceFeed | null) ?? null,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at === null ? null : new Date(row.fetched_at),
    error: row.error,
    errorAt: row.error_at === null ? null : new Date(row.error_at),
  }
}

export class PostgresMarketplaceCacheRepository implements MarketplaceCacheRepository {
  constructor(private readonly db: Database) {}

  async read(): Promise<CachedMarketplace> {
    const rows = resultRows(
      await this.db.execute(sql`
        select feed, source_url, fetched_at, error, error_at, notified_updates
          from marketplace_catalog
         where id = 1
      `),
    ) as Row[]

    return toCached(rows[0])
  }

  async saveFeed(input: {
    readonly feed: MarketplaceFeed
    readonly sourceUrl: string
    readonly fetchedAt: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into marketplace_catalog (id, feed, source_url, fetched_at, error, error_at, updated_at)
      values (1, ${JSON.stringify(input.feed)}::jsonb, ${input.sourceUrl}, ${input.fetchedAt}, null, null, now())
      on conflict (id) do update
        set feed = excluded.feed,
            source_url = excluded.source_url,
            fetched_at = excluded.fetched_at,
            error = null,
            error_at = null,
            updated_at = now()
    `)
  }

  async saveError(input: { readonly message: string; readonly at: Date }): Promise<void> {
    await this.db.execute(sql`
      insert into marketplace_catalog (id, error, error_at, updated_at)
      values (1, ${input.message}, ${input.at}, now())
      on conflict (id) do update
        set error = excluded.error,
            error_at = excluded.error_at,
            updated_at = now()
    `)
  }

  async claimNotified(key: string, version: string): Promise<boolean> {
    const marker = `${key}@${version}`
    const rows = resultRows(
      await this.db.execute(sql`
        insert into marketplace_catalog (id, notified_updates, updated_at)
        values (1, ${JSON.stringify([marker])}::jsonb, now())
        on conflict (id) do update
          set notified_updates = (
                select jsonb_agg(distinct value)
                  from jsonb_array_elements(marketplace_catalog.notified_updates || excluded.notified_updates)
              ),
              updated_at = now()
        where not (marketplace_catalog.notified_updates @> excluded.notified_updates)
        returning 1
      `),
    ) as unknown[]

    return rows.length > 0
  }
}
