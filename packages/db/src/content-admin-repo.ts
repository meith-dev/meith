/**
 * F71 — content administration: word filters and thread prefixes.
 *
 * Both tables are in the same file because both are small, board-wide
 * vocabularies edited on the same screen and read on the render path. Neither
 * has ever had a writer: `thread_prefixes` has been *read* by `thread-writes.ts`
 * since F33 and could only be populated with SQL, and `word_filters` is new.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type { WordFilterRule } from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface WordFilterRow extends WordFilterRule {
  readonly id: number
  readonly enabled: boolean
}

export interface SmileyRow {
  readonly id: number
  readonly code: string
  readonly src: string
  readonly alt: string | null
  readonly enabled: boolean
}

export interface DirectiveRow {
  readonly id: number
  readonly name: string
  readonly block: boolean
  readonly description: string | null
  readonly enabled: boolean
}

export interface ThreadPrefixRow {
  readonly id: number
  readonly label: string
  readonly token: string | null
  readonly displayOrder: number
  readonly communityPathPrefix: string | null
}

export class PostgresContentAdminRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- *
   * Word filters
   * ---------------------------------------------------------------- */

  /** Every filter, for the editor. */
  async listWordFilters(): Promise<readonly WordFilterRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, pattern, replacement, whole_word, enabled
          from word_filters order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toWordFilter)
  }

  /**
   * The filters the renderer applies.
   *
   * Disabled rows are dropped *here* rather than by the caller, so that
   * "enabled" cannot be forgotten at one of the render sites — a filter an
   * operator switched off but that still applies on one page is worse than no
   * switch at all.
   */
  async activeWordFilters(): Promise<readonly WordFilterRule[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select pattern, replacement, whole_word from word_filters
         where enabled = true and pattern <> ''
         order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      pattern: String(row.pattern),
      replacement: String(row.replacement),
      wholeWord: row.whole_word === true,
    }))
  }

  async createWordFilter(input: WordFilterRule): Promise<number> {
    const pattern = input.pattern.trim()
    if (pattern === '') throw new ValidationError('A filter needs something to match.')

    const rows = resultRows(
      await this.db.execute(sql`
        insert into word_filters (pattern, replacement, whole_word)
        values (${pattern}, ${input.replacement}, ${input.wholeWord})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  async updateWordFilter(
    id: number,
    input: WordFilterRule & { readonly enabled: boolean },
  ): Promise<void> {
    const pattern = input.pattern.trim()
    if (pattern === '') throw new ValidationError('A filter needs something to match.')

    const rows = resultRows(
      await this.db.execute(sql`
        update word_filters
           set pattern = ${pattern}, replacement = ${input.replacement},
               whole_word = ${input.wholeWord}, enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such filter.')
  }

  /**
   * Delete a filter.
   *
   * A real delete rather than a soft one, and it is safe *because* filtering
   * happens at render: nothing about a post depends on this row having existed,
   * so removing it simply restores the word. That is the same property `enabled`
   * gives, which is why both exist — one for "not for now", one for "never".
   */
  async deleteWordFilter(id: number): Promise<void> {
    await this.db.execute(sql`delete from word_filters where id = ${id}`)
  }

  /* ---------------------------------------------------------------- *
   * Thread prefixes
   * ---------------------------------------------------------------- */

  async listPrefixes(): Promise<readonly ThreadPrefixRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, label, token, display_order, community_path_prefix
          from thread_prefixes order by display_order, id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      label: String(row.label),
      token: row.token === null ? null : String(row.token),
      displayOrder: Number(row.display_order),
      communityPathPrefix: row.community_path_prefix === null ? null : String(row.community_path_prefix),
    }))
  }

  async createPrefix(input: {
    readonly label: string
    readonly token: string | null
    readonly displayOrder: number
    readonly communityPathPrefix: string | null
  }): Promise<number> {
    if (input.label.trim() === '') throw new ValidationError('A prefix needs a label.')

    const rows = resultRows(
      await this.db.execute(sql`
        insert into thread_prefixes (label, token, display_order, community_path_prefix)
        values (${input.label.trim()}, ${input.token}, ${input.displayOrder},
                ${input.communityPathPrefix})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  /**
   * Delete a prefix.
   *
   * `threads.prefix_id` is nullable with `on delete set null`, so threads
   * carrying it lose the prefix and nothing else. That is the behaviour worth
   * having: refusing to delete a prefix in use would make a mistyped one
   * permanent, and deleting the threads would be absurd.
   */
  async deletePrefix(id: number): Promise<void> {
    await this.db.execute(sql`delete from thread_prefixes where id = ${id}`)
  }

  /* ---------------------------------------------------------------- *
   * The board's markup vocabulary (F71)
   * ---------------------------------------------------------------- */

  /**
   * The revision every stored render is stamped with.
   *
   * Absent means zero, which is the column default and the state of a board
   * that has never configured a smiley — so installing this feature does not
   * make every post on the board stale.
   */
  async vocabularyRevision(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select version from cache_versions where key = 'markdown_vocabulary'
      `),
    ) as Array<{ version: number }>

    return Number(rows[0]?.version ?? 0)
  }

  /**
   * Bump the revision, invalidating every stored render on the board.
   *
   * Called by each of the six vocabulary writes rather than by one wrapper
   * around them, because a write that forgot it would not fail — it would leave
   * the board rendering the *old* vocabulary from cache until something else
   * happened to bump it, which is a bug that reproduces only on a board nobody
   * has edited since.
   *
   * The bump is deliberately not conditional on anything having changed. A save
   * that stored identical values costs one wasted backfill sweep; a save that
   * changed something and skipped the bump costs a board that is wrong.
   */
  async bumpVocabulary(): Promise<void> {
    await this.db.execute(sql`
      insert into cache_versions (key, version) values ('markdown_vocabulary', 1)
      on conflict (key) do update
         set version = cache_versions.version + 1, bumped_at = now()
    `)
  }

  async listSmilies(): Promise<readonly SmileyRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, code, src, alt, enabled from smilies order by code
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      src: String(row.src),
      alt: row.alt === null ? null : String(row.alt),
      enabled: row.enabled === true,
    }))
  }

  async createSmiley(input: {
    readonly code: string
    readonly src: string
    readonly alt: string | null
  }): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into smilies (code, src, alt)
        values (${input.code}, ${input.src}, ${input.alt})
        returning id
      `),
    ) as Array<{ id: number }>

    await this.bumpVocabulary()
    return Number(rows[0]?.id)
  }

  async updateSmiley(
    id: number,
    input: { readonly code: string; readonly src: string; readonly alt: string | null; readonly enabled: boolean },
  ): Promise<void> {
    const rows = resultRows(
      await this.db.execute(sql`
        update smilies
           set code = ${input.code}, src = ${input.src}, alt = ${input.alt},
               enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such smiley.')
    await this.bumpVocabulary()
  }

  /**
   * Delete a smiley.
   *
   * Safe, and for a reason worth stating: the code an author typed is still in
   * `posts.message`. Deleting the row means the next render shows `:)` as the
   * two characters it always was, everywhere, at once — nothing a member wrote
   * is lost, which is why there is no "in use" check to refuse this.
   */
  async deleteSmiley(id: number): Promise<void> {
    await this.db.execute(sql`delete from smilies where id = ${id}`)
    await this.bumpVocabulary()
  }

  async listDirectives(): Promise<readonly DirectiveRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, name, block, description, enabled from custom_directives order by name
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      block: row.block === true,
      description: row.description === null ? null : String(row.description),
      enabled: row.enabled === true,
    }))
  }

  async createDirective(input: {
    readonly name: string
    readonly block: boolean
    readonly description: string | null
  }): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into custom_directives (name, block, description)
        values (${input.name}, ${input.block}, ${input.description})
        returning id
      `),
    ) as Array<{ id: number }>

    await this.bumpVocabulary()
    return Number(rows[0]?.id)
  }

  async updateDirective(
    id: number,
    input: {
      readonly name: string
      readonly block: boolean
      readonly description: string | null
      readonly enabled: boolean
    },
  ): Promise<void> {
    const rows = resultRows(
      await this.db.execute(sql`
        update custom_directives
           set name = ${input.name}, block = ${input.block},
               description = ${input.description}, enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such directive.')
    await this.bumpVocabulary()
  }

  /**
   * Delete a directive.
   *
   * Same argument as a smiley, with one more consequence to be honest about:
   * `:spoiler[x]` in a post whose directive has been removed renders as that
   * literal text, because the parser only opens a directive it has been told
   * about (F36). Nothing is lost and nothing breaks — the post shows the markup
   * its author typed, which is the least surprising of the available failures.
   */
  async deleteDirective(id: number): Promise<void> {
    await this.db.execute(sql`delete from custom_directives where id = ${id}`)
    await this.bumpVocabulary()
  }
}

function toWordFilter(row: Record<string, unknown>): WordFilterRow {
  return {
    id: Number(row.id),
    pattern: String(row.pattern),
    replacement: String(row.replacement),
    wholeWord: row.whole_word === true,
    enabled: row.enabled === true,
  }
}
