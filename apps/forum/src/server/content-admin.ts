import 'server-only'

import { CacheTags, ForbiddenError } from '@meith/core'
import {
  compileWordFilter,
  type BoardVocabulary,
  type CompiledWordFilter,
} from '@meith/markdown'
import {
  PostgresAttachmentAdminRepository,
  PostgresContentAdminRepository,
  getDb,
  readBoardVocabulary,
} from '@meith/db'
import { unstable_cache } from 'next/cache'

import { getContainer } from './container'

export function contentAdminRepository(): PostgresContentAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresContentAdminRepository(getDb())
    : null
}

export function requireContentAdmin(): PostgresContentAdminRepository {
  const repository = contentAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its content settings cannot be edited.',
    )
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

const loadVocabulary = unstable_cache(
  async () => readBoardVocabulary(getDb()),
  ['markdown-vocabulary'],
  { tags: [CacheTags.markdownVocabulary()] },
)

export async function activeVocabulary(): Promise<BoardVocabulary | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const vocabulary = await loadVocabulary()
  return vocabulary.revision === 0 ? undefined : vocabulary
}

export function attachmentAdminRepository(): PostgresAttachmentAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresAttachmentAdminRepository(getDb())
    : null
}

export function requireAttachmentAdmin(): PostgresAttachmentAdminRepository {
  const repository = attachmentAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it has no attachments.',
    )
  }
  return repository
}
