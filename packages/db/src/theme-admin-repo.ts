import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface ThemeRecord {
  readonly key: string
  readonly title: string
  readonly tokenOverrides: unknown
  readonly customCss: string | null
  readonly enabled: boolean
  readonly isDefault: boolean
  readonly updatedAt: Date | null
}

export interface ThemeExport {
  readonly version: 2
  readonly key: string
  readonly tokenOverrides: unknown
  readonly customCss: string | null
}

export class PostgresThemeAdminRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<readonly ThemeRecord[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, title, token_overrides, custom_css, enabled, is_default, updated_at
          from themes order by key
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRecord)
  }

  async read(key: string): Promise<ThemeRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, title, token_overrides, custom_css, enabled, is_default, updated_at
          from themes where key = ${key}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toRecord(row)
  }

  async save(input: {
    readonly key: string
    readonly title: string
    readonly tokenOverrides: unknown
    readonly customCss: string | null
  }): Promise<void> {
    if (input.key.trim() === '') throw new ValidationError('No such theme.')

    await this.db.execute(sql`
      insert into themes (key, title, token_overrides, custom_css, updated_at)
      values (${input.key}, ${input.title},
              ${JSON.stringify(input.tokenOverrides ?? {})}::jsonb, ${input.customCss}, now())
      on conflict (key) do update
         set title = excluded.title,
             token_overrides = excluded.token_overrides,
             custom_css = excluded.custom_css,
             updated_at = now()
    `)
  }

  async setEnabled(key: string, enabled: boolean, title: string): Promise<void> {
    if (key.trim() === '') throw new ValidationError('No such theme.')

    await this.db.execute(sql`
      insert into themes (key, title, enabled, updated_at)
      values (${key}, ${title}, ${enabled}, now())
      on conflict (key) do update set enabled = excluded.enabled, updated_at = now()
    `)
  }

  async setDefault(key: string, title: string): Promise<void> {
    if (key.trim() === '') throw new ValidationError('No such theme.')

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`update themes set is_default = false where is_default`)
      await tx.execute(sql`
        insert into themes (key, title, is_default, enabled, updated_at)
        values (${key}, ${title}, true, true, now())
        on conflict (key) do update
           set is_default = true, enabled = true, updated_at = now()
      `)
    })
  }

  async reset(key: string): Promise<void> {
    await this.db.execute(sql`
      update themes set token_overrides = '{}'::jsonb, custom_css = null, updated_at = now()
       where key = ${key}
    `)
    await this.db.execute(sql`
      delete from themes where key = ${key} and enabled and not is_default
    `)
  }

  async exportTheme(key: string): Promise<ThemeExport> {
    const record = await this.read(key)
    return {
      version: 2,
      key,
      tokenOverrides: record?.tokenOverrides ?? {},
      customCss: record?.customCss ?? null,
    }
  }
}

export function parseThemeExport(raw: string): {
  readonly tokenOverrides: Readonly<Record<string, unknown>>
  readonly customCss: string | null
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError('That is not valid JSON.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('A theme file is a JSON object.')
  }

  const document = parsed as Record<string, unknown>
  if (document.version !== 1 && document.version !== 2) {
    throw new ValidationError(
      'That theme file was written by a different version of this board and cannot be read.',
    )
  }

  const tokens = document.tokenOverrides
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
    throw new ValidationError('A theme file needs a `tokenOverrides` object.')
  }

  const css = document.customCss
  if (css !== null && css !== undefined && typeof css !== 'string') {
    throw new ValidationError('`customCss` must be text, or null.')
  }

  return {
    tokenOverrides: tokens as Record<string, unknown>,
    customCss: typeof css === 'string' ? css : null,
  }
}

function toRecord(row: Record<string, unknown>): ThemeRecord {
  const overrides = row.token_overrides
  return {
    key: String(row.key),
    title: String(row.title),
    tokenOverrides:
      typeof overrides === 'object' && overrides !== null && !Array.isArray(overrides)
        ? overrides
        : {},
    customCss: row.custom_css === null ? null : String(row.custom_css),
    enabled: row.enabled !== false,
    isDefault: row.is_default === true,
    updatedAt:
      row.updated_at === null || row.updated_at === undefined
        ? null
        : row.updated_at instanceof Date
          ? row.updated_at
          : new Date(String(row.updated_at)),
  }
}
