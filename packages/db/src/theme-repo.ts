/** Runtime-only theme data (F26). */
import { eq } from 'drizzle-orm'

import type { Database } from './client'
import { themes } from './schema'

export interface ThemeRuntimeRecord {
  readonly tokenOverrides: unknown
  readonly customCss: string | null
}

/** One theme's stored state, as the page cascade needs it. */
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

  /**
   * Every stored theme row, for the page cascade.
   *
   * One query rather than one per registered theme, and it returns *rows*
   * rather than an answer about themes: which themes exist is
   * `community.config.ts`'s business (invariant 6), and a row here is only ever the
   * exception to what a theme ships with. A board that has never opened the
   * theme screen returns nothing from this and renders exactly as it did before
   * the table had a writer.
   */
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
