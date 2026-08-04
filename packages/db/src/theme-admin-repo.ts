/**
 * F68 — the theme record's writer.
 *
 * `themes` has had a row shape since the initial schema and a *reader* since
 * F26 (`PostgresThemeRepository.findRuntimeByKey`, which every page render goes
 * through). It has never had a writer: a board could be restyled only by
 * editing the row with SQL. This is the fifth table this project has found in
 * that state.
 *
 * Two things about the writes.
 *
 * **A row is created on first save, not on install.** There is nothing to
 * migrate and nothing to seed: an absent row means "no overrides", which is
 * exactly what a freshly installed theme has, and `findRuntimeByKey` already
 * returns null for it. Seeding an empty row on install would make "has this
 * board been customised?" unanswerable.
 *
 * **A reset deletes the row rather than writing empty values.** The two are
 * indistinguishable to every reader, and deleting is the one that leaves the
 * board in the state a fresh install is in — which is what an operator pressing
 * "reset" means, and what makes the answer to the question above stay true.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** Everything an operator can change about a theme, as stored. */
export interface ThemeRecord {
  readonly key: string
  readonly title: string
  readonly tokenOverrides: Readonly<Record<string, string>>
  readonly customCss: string | null
  readonly updatedAt: Date | null
}

/**
 * The exported/imported shape.
 *
 * Deliberately *not* the row: `updated_at` is when this board saved, and
 * carrying it across would make an import claim a history it does not have.
 * `version` is here so a future change to the shape can be detected rather than
 * silently mis-read — an import is a file somebody has been emailed.
 */
export interface ThemeExport {
  readonly version: 1
  readonly key: string
  readonly tokenOverrides: Readonly<Record<string, string>>
  readonly customCss: string | null
}

export class PostgresThemeAdminRepository {
  constructor(private readonly db: Database) {}

  /** Every stored customisation, for the listing. */
  async list(): Promise<readonly ThemeRecord[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, title, token_overrides, custom_css, updated_at
          from themes order by key
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRecord)
  }

  async read(key: string): Promise<ThemeRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, title, token_overrides, custom_css, updated_at
          from themes where key = ${key}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toRecord(row)
  }

  /**
   * Write the customisation, creating the row if this is the first one.
   *
   * The whole set every time, not a patch: the editor shows every token the
   * theme declares, so what it submits *is* the intended set — and a partial
   * write would leave a token an operator cleared at whatever a previous save
   * put there. The same rule F64's settings and F66's group permissions follow.
   *
   * **Validation is the caller's.** F26's `validateTokenOverrides` and
   * `validateCustomCss` are what the render path uses, and running the same
   * functions before the write is what makes "saved" mean "will render" — a
   * second implementation here would eventually disagree with the one that
   * paints.
   */
  async save(input: {
    readonly key: string
    readonly title: string
    readonly tokenOverrides: Readonly<Record<string, string>>
    readonly customCss: string | null
  }): Promise<void> {
    if (input.key.trim() === '') throw new ValidationError('No such theme.')

    await this.db.execute(sql`
      insert into themes (key, title, token_overrides, custom_css, updated_at)
      values (${input.key}, ${input.title},
              ${JSON.stringify(input.tokenOverrides)}::jsonb, ${input.customCss}, now())
      on conflict (key) do update
         set title = excluded.title,
             token_overrides = excluded.token_overrides,
             custom_css = excluded.custom_css,
             updated_at = now()
    `)
  }

  /**
   * Put the theme back to what it ships with.
   *
   * Deletes the row. Empty overrides and no row are indistinguishable to every
   * reader, and the delete is the one that leaves the board in the state a
   * fresh install is in.
   */
  async reset(key: string): Promise<void> {
    await this.db.execute(sql`delete from themes where key = ${key}`)
  }

  /** The stored customisation as a portable document. */
  async exportTheme(key: string): Promise<ThemeExport> {
    const record = await this.read(key)
    return {
      version: 1,
      key,
      tokenOverrides: record?.tokenOverrides ?? {},
      customCss: record?.customCss ?? null,
    }
  }
}

/**
 * Parse an exported document.
 *
 * Strict about the envelope and silent about nothing: an import is a file
 * somebody has been emailed, and the failure to catch is a document from a
 * *different* board or a later version of this shape being applied as if it
 * were this one. The token values themselves are validated by the caller with
 * F26's validator — the same one the render path uses.
 *
 * The key is deliberately **not** trusted from the document. Importing a
 * "default" export onto a theme called something else is a legitimate thing to
 * want (copying a look between boards), and refusing it would make the feature
 * useless for the case it exists for; so the key in the file is ignored and the
 * one being edited is used.
 */
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
  if (document.version !== 1) {
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
        ? (overrides as Record<string, string>)
        : {},
    customCss: row.custom_css === null ? null : String(row.custom_css),
    updatedAt:
      row.updated_at === null || row.updated_at === undefined
        ? null
        : row.updated_at instanceof Date
          ? row.updated_at
          : new Date(String(row.updated_at)),
  }
}
