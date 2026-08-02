/**
 * F71 — content administration: word filters and thread prefixes.
 *
 * Both tables are in the same file because both are small, board-wide
 * vocabularies edited on the same screen and read on the render path. Neither
 * has ever had a writer: `thread_prefixes` has been *read* by `thread-writes.ts`
 * since F33 and could only be populated with SQL, and `word_filters` is new.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@forum/core'
import type { WordFilterRule } from '@forum/bbcode'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface WordFilterRow extends WordFilterRule {
  readonly id: number
  readonly enabled: boolean
}

export interface ThreadPrefixRow {
  readonly id: number
  readonly label: string
  readonly token: string | null
  readonly displayOrder: number
  readonly forumPathPrefix: string | null
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
        select id, label, token, display_order, forum_path_prefix
          from thread_prefixes order by display_order, id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      label: String(row.label),
      token: row.token === null ? null : String(row.token),
      displayOrder: Number(row.display_order),
      forumPathPrefix: row.forum_path_prefix === null ? null : String(row.forum_path_prefix),
    }))
  }

  async createPrefix(input: {
    readonly label: string
    readonly token: string | null
    readonly displayOrder: number
    readonly forumPathPrefix: string | null
  }): Promise<number> {
    if (input.label.trim() === '') throw new ValidationError('A prefix needs a label.')

    const rows = resultRows(
      await this.db.execute(sql`
        insert into thread_prefixes (label, token, display_order, forum_path_prefix)
        values (${input.label.trim()}, ${input.token}, ${input.displayOrder},
                ${input.forumPathPrefix})
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
