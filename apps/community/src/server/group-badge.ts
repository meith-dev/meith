import 'server-only'

/**
 * A usergroup's badge image.
 *
 * The board logo's arrangement, applied to a row instead of a setting, and
 * through the same `image-upload` module — one decision about what an uploaded
 * file is, so the two cannot drift into disagreeing.
 *
 * ## What this replaces
 *
 * `usergroups.badge_token`, which has been written by the group editor since
 * the initial schema and read by nothing. It stores a *token name* from the R7
 * set so a theme could restyle a badge, and it could never work: the token list
 * is compiled into `globals.css`, so it is fixed at four group tokens, while
 * groups are rows a board creates. A board's "Veterans" badge is a picture
 * somebody drew, and no token names a picture.
 *
 * ## The key is checked on the way out as well as in
 *
 * The stored value is a file-store key an operator can reach with SQL and a
 * restored backup can carry across from another board, and it is about to
 * become a path. `LocalFileStore` already refuses to escape its root, but
 * "something else checks it" is the reasoning behind every traversal that ever
 * shipped.
 */
import { CacheTags } from '@meith/core'
import { PostgresGroupAdminRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { cache } from 'react'

import { getContainer } from './container'
import { forgetImage, storeImage, type ImageScheme } from './image-upload'

/** The form field a badge upload arrives in. */
export const BADGE_FIELD = 'badge'

const KEY_SHAPE = /^group\/(\d+)\/badge-(light|dark)-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/

function repository(): PostgresGroupAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresGroupAdminRepository(getDb())
    : null
}

/**
 * The URL a badge is served from.
 *
 * The key's UUID in the query, for the reason `logoSrc` gives: `/group/3/badge/light`
 * is a fixed path, and without something that changes when the image does the
 * route could not send `immutable` — a replaced badge would sit in caches.
 */
export function badgeSrc(groupId: number, scheme: ImageScheme, key: string): string {
  return `/group/${groupId}/badge/${scheme}?v=${key.slice(-16, -4)}`
}

/** The stored key for one group and scheme, or `null`. */
export const badgeKey = cache(
  async (groupId: number, scheme: ImageScheme): Promise<string | null> => {
    const repo = repository()
    if (repo === null) return null

    const group = (await repo.list().catch(() => [])).find((row) => row.id === groupId)
    const key = scheme === 'dark' ? group?.badgeImageDark : group?.badgeImageLight
    if (typeof key !== 'string' || !KEY_SHAPE.test(key)) return null

    /*
     * The path says which group; the key says which group. A row whose key
     * names a *different* group is not a badge this route will serve — that is
     * how one group's upload would end up answering another group's URL after a
     * hand-edited row or a botched restore.
     */
    return KEY_SHAPE.exec(key)?.[1] === String(groupId) ? key : null
  },
)

/** Accept an upload, point the group at it, and drop what it replaced. */
export async function saveBadge(
  groupId: number,
  scheme: ImageScheme,
  file: File,
): Promise<void> {
  const repo = requireGroups()
  const key = await storeImage(`group/${groupId}`, `badge-${scheme}`, file)

  const previous = await repo.setBadge(groupId, scheme, key)
  await invalidate()
  if (previous !== key) await forgetImage(previous)
}

/** Put the group back to a name with no picture beside it. */
export async function removeBadge(groupId: number, scheme: ImageScheme): Promise<void> {
  const previous = await requireGroups().setBadge(groupId, scheme, null)
  await invalidate()
  await forgetImage(previous)
}

function requireGroups(): PostgresGroupAdminRepository {
  const repo = repository()
  if (repo === null) {
    throw new Error('This board is running on in-memory sample data, so groups cannot be edited.')
  }
  return repo
}

/**
 * Drop what the badge appears in.
 *
 * `groups` is the tag the group editor already clears, and the same one the
 * username-colour stylesheet is cached against — a badge and a colour are one
 * change to one row, so one tag is the honest granularity.
 */
async function invalidate(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.groups()])
}
