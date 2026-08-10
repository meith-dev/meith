import { eq } from 'drizzle-orm'

import type { Database } from './client'
import { themes } from './schema'

export interface ThemeRuntimeRecord {
  readonly tokenOverrides: unknown
  readonly customCss: string | null
}

export interface ThemeRuntimeState extends ThemeRuntimeRecord {
  readonly key: string
  readonly enabled: boolean
  readonly isDefault: boolean
}

export class PostgresThemeRepository {
  constructor(private readonly db: Database) {}

  async findRuntimeByKey(key: string): Promise<ThemeRuntimeRecord | null> {
    const rows = await this.db
      .select({ tokenOverrides: themes.tokenOverrides, customCss: themes.customCss })
      .from(themes)
      .where(eq(themes.key, key))
      .limit(1)

    return rows[0] ?? null
  }

  async listRuntime(): Promise<readonly ThemeRuntimeState[]> {
    const rows = await this.db
      .select({
        key: themes.key,
        tokenOverrides: themes.tokenOverrides,
        customCss: themes.customCss,
        enabled: themes.enabled,
        isDefault: themes.isDefault,
      })
      .from(themes)

    return rows
  }
}
