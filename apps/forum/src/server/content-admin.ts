import 'server-only'

/**
 * F71 at the app layer.
 *
 * The word filter set is read on the **render path** — every thread page runs
 * it — so it is cached against its own tag and compiled once per render rather
 * than once per post. The set is small by design; the editor says so, and the
 * cost of an operator ignoring that is a slower thread page rather than a
 * broken one.
 */
import { CacheTags, ForbiddenError } from '@meith/core'
import {
  compileWordFilter,
  type BoardVocabulary,
  type CompiledWordFilter,
} from '@meith/bbcode'
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

/**
 * The compiled filter for a render, or `undefined` when there is nothing to do.
 *
 * `undefined` rather than an empty compiled set, so the render path can skip
 * the pass entirely — on the overwhelming majority of boards there are no
 * filters at all, and they should pay nothing for the feature.
 */
export async function activeWordFilter(): Promise<CompiledWordFilter | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const rules = await loadFilters()
  return rules.length === 0 ? undefined : compileWordFilter(rules)
}

/**
 * The board's BBCode vocabulary, for the render path (F71).
 *
 * Cached under its own tag, like the filters, and for a stronger reason: this
 * one is read by *every* page that renders a body, and a board's smilies change
 * about as often as its name. Every write in `PostgresContentAdminRepository`'s
 * vocabulary section bumps `cache_versions['bbcode_vocabulary']`, so the ACP's
 * invalidation and the stored renders' staleness are the same fact rather than
 * two that can disagree.
 *
 * `undefined` on a board that has configured nothing — the common case, and the
 * one where the render path should pay nothing at all. Note that `undefined`
 * and `EMPTY_VOCABULARY` mean the same thing to `postBodyHtml`, both being
 * revision 0, so a caller cannot get this wrong in the expensive direction.
 */
const loadVocabulary = unstable_cache(
  async () => readBoardVocabulary(getDb()),
  ['bbcode-vocabulary'],
  { tags: [CacheTags.bbcodeVocabulary()] },
)

export async function activeVocabulary(): Promise<BoardVocabulary | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const vocabulary = await loadVocabulary()
  return vocabulary.revision === 0 ? undefined : vocabulary
}

/**
 * F71's attachment listing.
 *
 * Not cached, unlike the two vocabularies above, and the difference is what the
 * data is for: those are read by every render and change twice a year, this is
 * read by one operator on one screen and changes every time somebody uploads a
 * file. A cached listing would show an administrator a board state that no
 * longer exists, on the screen where they are about to delete things.
 */
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
