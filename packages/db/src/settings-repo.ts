import { inArray, sql } from 'drizzle-orm'

import { ConfigurationError, env, logger, openValue, sealValue } from '@meith/core'
import { SETTING_DEFINITIONS, type SettingsRepository } from '@meith/settings'

import type { Database } from './client'
import { settings } from './schema'

export const SETTING_SEAL_PURPOSE = 'meith/sealed-setting'

const SEALED_KEYS: ReadonlySet<string> = new Set(
  SETTING_DEFINITIONS.filter((definition) => definition.sealed === true).map(
    (definition) => definition.key,
  ),
)

export interface SettingSealer {
  seal(key: string, value: string): Promise<string>
  open(key: string, stored: string): Promise<string | null>
}

export function settingSealer(passphrase: string | undefined): SettingSealer {
  return {
    async seal(key, value) {
      if (passphrase === undefined || passphrase.trim() === '') {
        throw new ConfigurationError(
          `The ${key} setting is stored sealed, which needs AUTH_SECRET set: without a key ` +
            'to seal it with, the credential would sit in the database in the clear.',
        )
      }
      return sealValue(value, passphrase, SETTING_SEAL_PURPOSE)
    },
    async open(_key, stored) {
      if (passphrase === undefined || passphrase.trim() === '') return null
      return openValue(stored, passphrase, SETTING_SEAL_PURPOSE)
    },
  }
}

export class PostgresSettingsRepository implements SettingsRepository {
  private readonly sealer: SettingSealer

  constructor(
    private readonly db: Database,
    sealer?: SettingSealer,
  ) {
    this.sealer = sealer ?? settingSealer(env.AUTH_SECRET)
  }

  async loadAll(): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db.select({ key: settings.key, value: settings.value }).from(settings)
    const loaded = new Map<string, string>()
    for (const row of rows) {
      if (!SEALED_KEYS.has(row.key)) {
        loaded.set(row.key, row.value)
        continue
      }
      const opened = await this.sealer.open(row.key, row.value)
      if (opened === null) {
        logger({ module: 'settings' }).warn(
          { key: row.key },
          'a sealed setting could not be opened under AUTH_SECRET and is treated as unset',
        )
        continue
      }
      loaded.set(row.key, opened)
    }
    return loaded
  }

  async save(entries: ReadonlyMap<string, string>): Promise<void> {
    if (entries.size === 0) return

    const values: { key: string; value: string }[] = []
    for (const [key, value] of entries) {
      values.push({ key, value: SEALED_KEYS.has(key) ? await this.sealer.seal(key, value) : value })
    }

    await this.db
      .insert(settings)
      .values(values)
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      })
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    await this.db.delete(settings).where(inArray(settings.key, [...keys]))
  }
}
