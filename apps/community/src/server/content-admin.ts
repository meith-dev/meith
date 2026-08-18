import { msg } from '@meith/i18n'
import 'server-only'

import { unstable_cache } from 'next/cache'

import { CacheTags, ForbiddenError } from '@meith/core'
import {
  getDb,
  PostgresAttachmentAdminRepository,
  PostgresContentAdminRepository,
  readVocabularySource,
} from '@meith/db'
import {
  type BoardVocabulary,
  type CompiledWordFilter,
  compileVocabulary,
  compileWordFilter,
} from '@meith/markdown'

import { getContainer } from './container'

export function contentAdminRepository(): PostgresContentAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresContentAdminRepository(getDb())
    : null
}

export function requireContentAdmin(): PostgresContentAdminRepository {
  const repository = contentAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-22'))
  }
  return repository
}

const loadFilters = unstable_cache(
  async () => new PostgresContentAdminRepository(getDb()).activeWordFilters(),
  ['word-filters'],
  { tags: [CacheTags.wordFilters()] },
)

export async function activeWordFilter(): Promise<CompiledWordFilter | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const rules = await loadFilters()
  return rules.length === 0 ? undefined : compileWordFilter(rules)
}

const loadVocabularySource = unstable_cache(
  async () => readVocabularySource(getDb()),
  ['markdown-vocabulary-rows'],
  { tags: [CacheTags.markdownVocabulary()] },
)

export async function activeVocabulary(): Promise<BoardVocabulary | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const source = await loadVocabularySource()
  if (source === null || source.revision === 0) return undefined

  return compileVocabulary(source)
}

export function attachmentAdminRepository(): PostgresAttachmentAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresAttachmentAdminRepository(getDb())
    : null
}

export function requireAttachmentAdmin(): PostgresAttachmentAdminRepository {
  const repository = attachmentAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-23'))
  }
  return repository
}
