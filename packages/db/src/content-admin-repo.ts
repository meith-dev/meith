import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
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
  readonly forumPathPrefix: string | null
}

export class PostgresContentAdminRepository {
  constructor(private readonly db: Database) {}

  async listWordFilters(): Promise<readonly WordFilterRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, pattern, replacement, whole_word, enabled
          from word_filters order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toWordFilter)
  }

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
    if (pattern === '') throw new ValidationError(msg('error.db.filter-needs-something-match'))

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
    if (pattern === '') throw new ValidationError(msg('error.db.filter-needs-something-match'))

    const rows = resultRows(
      await this.db.execute(sql`
        update word_filters
           set pattern = ${pattern}, replacement = ${input.replacement},
               whole_word = ${input.wholeWord}, enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError(msg('error.db.such-filter'))
  }

  async deleteWordFilter(id: number): Promise<void> {
    await this.db.execute(sql`delete from word_filters where id = ${id}`)
  }

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
    if (input.label.trim() === '') throw new ValidationError(msg('error.db.prefix-needs-label'))

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

  async deletePrefix(id: number): Promise<void> {
    await this.db.execute(sql`delete from thread_prefixes where id = ${id}`)
  }

  async vocabularyRevision(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select version from cache_versions where key = 'markdown_vocabulary'
      `),
    ) as Array<{ version: number }>

    return Number(rows[0]?.version ?? 0)
  }

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
    input: {
      readonly code: string
      readonly src: string
      readonly alt: string | null
      readonly enabled: boolean
    },
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

    if (rows[0] === undefined) throw new ValidationError(msg('error.db.such-smiley'))
    await this.bumpVocabulary()
  }

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

    if (rows[0] === undefined) throw new ValidationError(msg('error.db.such-directive'))
    await this.bumpVocabulary()
  }

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
