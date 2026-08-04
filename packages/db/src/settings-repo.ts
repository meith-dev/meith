/**
 * Postgres implementation of `SettingsRepository` (F08).
 *
 * Only *overrides* are stored. A key absent from this table means "use the
 * registry default", which is what lets a default change in a release actually
 * reach boards that never touched that setting — writing every default at
 * install time would freeze them forever.
 */
import { inArray, sql } from 'drizzle-orm'

import type { SettingsRepository } from '@meith/settings'

import type { Database } from './client'
import { settings } from './schema'

export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Database) {}

  async loadAll(): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db.select({ key: settings.key, value: settings.value }).from(settings)
    return new Map(rows.map((r) => [r.key, r.value]))
  }

  /**
   * Upsert in one statement.
   *
   * A delete-then-insert would leave a window where the setting reads as its
   * default — briefly reverting a board to, say, open registration.
   */
  async save(entries: ReadonlyMap<string, string>): Promise<void> {
    if (entries.size === 0) return

    await this.db
      .insert(settings)
      .values([...entries].map(([key, value]) => ({ key, value })))
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      })
  }

  /** Deleting an override is how a setting is reset to its registry default. */
  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    await this.db.delete(settings).where(inArray(settings.key, [...keys]))
  }
}
