/**
 * F68 — the theme record's writer.
 *
 * `themes` has had a row shape since the initial schema and a *reader* since
 * F26 (`PostgresThemeRepository.findRuntimeByKey`, which every page render goes
 * through). It has never had a writer: a board could be restyled only by
 * editing the row with SQL. This is the fifth table this project has found in
 * that state.
 *
 * Three things about the writes.
 *
 * **A row is created on first save, not on install.** There is nothing to
 * migrate and nothing to seed: an absent row means "no overrides, enabled, not
 * the default", which is exactly what a freshly installed theme has. Seeding an
 * empty row on install would make "has this board been customised?"
 * unanswerable.
 *
 * **A reset clears the customisation without discarding the board's decisions.**
 * It used to delete the row, and that was right when a row held nothing but
 * overrides. It no longer is: `enabled` and `is_default` are decisions an
 * administrator made about *which* themes a member may pick, and "put the
 * colours back" must not turn a disabled theme back on. So a reset empties the
 * two customisation columns, and deletes the row only when what remains is
 * indistinguishable from having no row at all.
 *
 * **The default theme is set, never toggled.** `themes_single_default_key` is a
 * unique partial index, so two rows claiming the default is a constraint
 * violation rather than a last-writer-wins race — which means the clear and the
 * set have to be one transaction, in that order.
 *
 * ## What this file does not know
 *
 * The *shape* of `token_overrides`. It is stored and returned as raw JSON,
 * because what a valid override is — which token names exist, which values are
 * safe in a stylesheet, whether a scheme-keyed map or a flat one — is decided by
 * the render path (`apps/community/src/server/theme-style.ts`) and running the same
 * function before the write is what makes "saved" mean "will render". A second
 * opinion here would eventually disagree with the one that paints.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** Everything an operator can change about a theme, as stored. */
export interface ThemeRecord {
  readonly key: string
  readonly title: string
  /** Raw JSON. The render path owns what a valid override looks like. */
  readonly tokenOverrides: unknown
  readonly customCss: string | null
  readonly enabled: boolean
  readonly isDefault: boolean
  readonly updatedAt: Date | null
}

/**
 * The exported/imported shape.
 *
 * Deliberately *not* the row: `updated_at` is when this board saved, and
 * carrying it across would make an import claim a history it does not have.
 * `enabled` and `is_default` are not here either, and for a stronger reason —
 * they are decisions about *this* board's menu, and a file that carried them
 * would silently rearrange the menu of the board it was pasted into.
 *
 * `version` describes the envelope, not the payload. It went to 2 when overrides
 * became scheme-keyed (`{ light, dark }`); a version 1 document holds the flat
 * map that means "both schemes", and both are still read, so an export taken
 * from an older board still imports.
 */
export interface ThemeExport {
  readonly version: 2
  readonly key: string
  readonly tokenOverrides: unknown
  readonly customCss: string | null
}

export class PostgresThemeAdminRepository {
  constructor(private readonly db: Database) {}

  /** Every stored row, for the listing. */
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

  /**
   * Write the customisation, creating the row if this is the first one.
   *
   * The whole set every time, not a patch: the editor shows every token the
   * theme declares, so what it submits *is* the intended set — and a partial
   * write would leave a token an operator cleared at whatever a previous save
   * put there. The same rule F64's settings and F66's group permissions follow.
   *
   * `enabled` and `is_default` are conspicuously absent from the update list.
   * Saving colours must not re-enable a theme an administrator turned off, and
   * on insert the column defaults do the right thing for a theme nobody has
   * made a decision about yet.
   *
   * **Validation is the caller's.** F26's `validateTokenOverrides` and
   * `validateCustomCss` are what the render path uses, and running the same
   * functions before the write is what makes "saved" mean "will render".
   */
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

  /**
   * Turn a theme on or off for members.
   *
   * Creates the row when there is none, because "off" is a decision and a
   * decision needs somewhere to live. Turning one back on does *not* delete the
   * row — it may still hold overrides — but a reset afterwards will, which is
   * how a board gets back to an empty table.
   */
  async setEnabled(key: string, enabled: boolean, title: string): Promise<void> {
    if (key.trim() === '') throw new ValidationError('No such theme.')

    await this.db.execute(sql`
      insert into themes (key, title, enabled, updated_at)
      values (${key}, ${title}, ${enabled}, now())
      on conflict (key) do update set enabled = excluded.enabled, updated_at = now()
    `)
  }

  /**
   * Make one theme the board default, and no other.
   *
   * Both statements in one transaction, clear before set: the partial unique
   * index means the opposite order fails outright the moment a default already
   * exists, and doing it in two round trips leaves a window in which the board
   * has none. Enabling is implied — an unpickable default is a board whose
   * members all see a theme none of them may choose.
   */
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

  /**
   * Put the theme's appearance back to what it ships with.
   *
   * Clears the two customisation columns, then deletes the row if nothing is
   * left that a fresh install would not have. Deleting unconditionally — which
   * is what this used to do — would quietly re-enable a theme an administrator
   * had turned off, and undoing a colour is not meant to change who can see it.
   */
  async reset(key: string): Promise<void> {
    await this.db.execute(sql`
      update themes set token_overrides = '{}'::jsonb, custom_css = null, updated_at = now()
       where key = ${key}
    `)
    await this.db.execute(sql`
      delete from themes where key = ${key} and enabled and not is_default
    `)
  }

  /** The stored customisation as a portable document. */
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

/**
 * Parse an exported document.
 *
 * Strict about the envelope and silent about nothing: an import is a file
 * somebody has been emailed, and the failure to catch is a document from a
 * *different* board or a later version of this shape being applied as if it
 * were this one. The token values themselves are validated by the caller with
 * F26's validator — the same one the render path uses.
 *
 * Versions 1 and 2 are both read. They differ only in whether `tokenOverrides`
 * is keyed by colour scheme, and the validator tells the two apart from the
 * payload itself, so refusing version 1 would break every export taken before
 * members could switch themes for no benefit at all.
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
