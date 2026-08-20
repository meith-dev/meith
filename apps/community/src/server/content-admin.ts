import { msg } from '@meith/i18n'
import 'server-only'

import { CacheTags, cachedGlobal, ForbiddenError } from '@meith/core'
import {
  getDb,
  PostgresAttachmentAdminRepository,
  PostgresContentAdminRepository,
  readVocabularySource,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import {
  type BoardVocabulary,
  type CompiledWordFilter,
  compileVocabulary,
  compileWordFilter,
  NO_VOCABULARY_SOURCE,
} from '@meith/markdown'

import { getContainer } from './container'
import { boardRendering } from './markdown-pipeline'
import { filterView } from './plugin-view'

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

const TTL_SECONDS = 60

function loadFilters(): ReturnType<PostgresContentAdminRepository['activeWordFilters']> {
  return cachedGlobal(
    drivers().cache,
    {
      key: ['word-filters'],
      tags: [CacheTags.wordFilters()],
      revalidate: TTL_SECONDS,
    },
    () => new PostgresContentAdminRepository(getDb()).activeWordFilters(),
  )
}

export async function activeWordFilter(): Promise<CompiledWordFilter | undefined> {
  const stored = getContainer().dataSource === 'postgres' ? await loadFilters() : []
  const rules = await filterView('word-filter.patterns', stored, {})

  return rules.length === 0 ? undefined : compileWordFilter(rules)
}

function loadVocabularySource(): ReturnType<typeof readVocabularySource> {
  return cachedGlobal(
    drivers().cache,
    {
      key: ['markdown-vocabulary-rows'],
      tags: [CacheTags.markdownVocabulary()],
      revalidate: TTL_SECONDS,
    },
    () => readVocabularySource(getDb()),
  )
}

export async function activeVocabulary(): Promise<BoardVocabulary | undefined> {
  const stored =
    getContainer().dataSource === 'postgres' ? await loadVocabularySource() : NO_VOCABULARY_SOURCE
  const source = await boardRendering.vocabulary(stored ?? NO_VOCABULARY_SOURCE)

  if (source.revision === 0 && source.smilies.length === 0 && source.directives.length === 0) {
    return undefined
  }

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
