/**
 * F85 — turning MyBB rows into this board's shapes.
 *
 * Pure functions, one per entity, and every one of them is a place where an
 * importer traditionally loses data quietly. The decisions are here rather than
 * inline in the runner so each can be tested against the row that motivated it.
 *
 * ## The rule: never invent, and never silently drop
 *
 * Where MyBB has something this board does not model, the import records it in
 * the report rather than discarding it. Where MyBB has nothing, the field takes
 * this board's default rather than a guess — a "reasonable" guess at a missing
 * value is indistinguishable from real data once it is in the database.
 */

import type { MybbCommunity, MybbPost, MybbThread, MybbUser } from './source'

/** What the board stores, as the importer produces it. */
export interface ImportedUser {
  readonly legacyId: number
  readonly username: string
  readonly email: string
  /**
   * MyBB's hash, prefixed so the verifier knows what it is looking at.
   *
   * `mybb$<salt>$<hash>`. F86 verifies against it and re-hashes with Argon2id on
   * the member's next successful sign-in — which is the only way to migrate
   * password hashes at all, since the plaintext is not in the export.
   *
   * A board that discarded these would force every member through a password
   * reset, which is the single largest source of attrition in a community migration.
   */
  readonly legacyPasswordHash: string
  readonly registeredAt: Date
  readonly lastVisitAt: Date | null
  readonly postCount: number
  readonly legacyGroupId: number
}

export interface ImportedCommunity {
  readonly legacyId: number
  readonly type: 'category' | 'community' | 'link'
  readonly title: string
  readonly description: string | null
  readonly legacyParentId: number | null
  readonly displayOrder: number
  readonly linkUrl: string | null
}

export type Visibility = 'visible' | 'unapproved' | 'deleted'

export interface ImportedThread {
  readonly legacyId: number
  readonly legacyCommunityId: number
  readonly title: string
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly createdAt: Date
  readonly lastPostAt: Date
  readonly replyCount: number
  readonly viewCount: number
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly visibility: Visibility
}

export interface ImportedPost {
  readonly legacyId: number
  readonly legacyThreadId: number
  readonly legacyCommunityId: number
  readonly legacyAuthorId: number
  readonly authorUsername: string
  readonly body: string
  readonly createdAt: Date
  readonly editedAt: Date | null
  readonly visibility: Visibility
}

/**
 * MyBB timestamps are Unix **seconds**.
 *
 * Multiplying by 1000 is the whole conversion, and getting it wrong produces
 * dates in 1970 — which is obvious — or, if somebody "fixes" it by treating them
 * as milliseconds, dates in 1970 that look like plausible sub-second offsets from
 * the epoch and sort correctly relative to each other. The second failure is the
 * one that ships.
 *
 * `0` means "never" in MyBB rather than 1 January 1970, so it maps to `null`
 * wherever the field is nullable and to the row's other timestamp where it is
 * not.
 */
export function fromUnixSeconds(seconds: number): Date | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000)
}

/**
 * MyBB's `visible` column, which is three states in an integer.
 *
 * `1` visible, `0` awaiting moderation, `-1` soft-deleted. Anything else is
 * treated as **unapproved** rather than visible: an unknown value in this column
 * comes from a plugin, and the safe reading of "I do not know whether this
 * should be public" is that it should not be.
 */
export function visibilityOf(visible: number): Visibility {
  if (visible === 1) return 'visible'
  if (visible === -1) return 'deleted'
  return 'unapproved'
}

export function mapUser(row: MybbUser): ImportedUser {
  return {
    legacyId: row.uid,
    username: row.username,
    /*
     * Lower-cased, because this board's uniqueness is case-insensitive (F18) and
     * MyBB's is not. Two MyBB accounts differing only in case collide here — the
     * runner reports that as a conflict rather than silently keeping one.
     */
    email: row.email.trim().toLowerCase(),
    legacyPasswordHash: `mybb$${row.salt}$${row.password}`,
    /* A registration date of 0 is data corruption; the epoch is a better lie than a crash. */
    registeredAt: fromUnixSeconds(row.regdate) ?? new Date(0),
    lastVisitAt: fromUnixSeconds(row.lastvisit),
    /*
     * Carried across, then **recounted**. MyBB's own post count drifts — it is
     * incremented on post and not always decremented on delete — so importing it
     * as truth would bake somebody else's bug into a fresh board. It is imported
     * so the report can say how far off it was.
     */
    postCount: Math.max(0, row.postnum),
    legacyGroupId: row.usergroup,
  }
}

const COMMUNITY_TYPES: Readonly<Record<string, ImportedCommunity['type']>> = {
  f: 'community',
  c: 'category',
  l: 'link',
}

export function mapCommunity(row: MybbCommunity): ImportedCommunity {
  return {
    legacyId: row.fid,
    /*
     * An unknown type becomes a community. MyBB has exactly three and a fourth would
     * come from a plugin; a community is the type that loses nothing — its threads
     * still import, where treating it as a link would orphan them.
     */
    type: COMMUNITY_TYPES[row.type] ?? 'community',
    title: row.name,
    description: row.description.trim() === '' ? null : row.description,
    /* MyBB uses 0 for "top level"; this board uses null. */
    legacyParentId: row.pid === 0 ? null : row.pid,
    displayOrder: row.disporder,
    linkUrl: row.type === 'l' && row.linkto.trim() !== '' ? row.linkto : null,
  }
}

export function mapThread(row: MybbThread): ImportedThread {
  const createdAt = fromUnixSeconds(row.dateline) ?? new Date(0)

  return {
    legacyId: row.tid,
    legacyCommunityId: row.fid,
    title: row.subject,
    legacyAuthorId: row.uid,
    /*
     * The denormalised name is carried across, because MyBB keeps it for exactly
     * the reason this board does (R3.3): a thread whose author was deleted still
     * has an author's name on it, and dropping the string loses attribution that
     * cannot be recovered from anywhere.
     */
    authorUsername: row.username,
    createdAt,
    /* `lastpost` of 0 on a thread with posts is corruption; its own creation is the safe floor. */
    lastPostAt: fromUnixSeconds(row.lastpost) ?? createdAt,
    replyCount: Math.max(0, row.replies),
    viewCount: Math.max(0, row.views),
    isSticky: row.sticky === 1,
    /* MyBB stores this as the *string* '1'/'0', which is a classic import bug. */
    isLocked: row.closed === '1',
    visibility: visibilityOf(row.visible),
  }
}

export function mapPost(row: MybbPost): ImportedPost {
  return {
    legacyId: row.pid,
    legacyThreadId: row.tid,
    legacyCommunityId: row.fid,
    legacyAuthorId: row.uid,
    authorUsername: row.username,
    body: row.message,
    createdAt: fromUnixSeconds(row.dateline) ?? new Date(0),
    /*
     * `edittime` is 0 on a post that was never edited. Mapping that to the epoch
     * would put "last edited 1 January 1970" under a third of the posts on an old
     * board.
     */
    editedAt: row.edituid === 0 ? null : fromUnixSeconds(row.edittime),
    visibility: visibilityOf(row.visible),
  }
}
