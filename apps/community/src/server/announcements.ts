import 'server-only'

/**
 * F71 — the board's live announcements, as the pages need them.
 *
 * ## Not cached, and that is the interesting decision
 *
 * Everything else read on the index goes through F10's tag cache. This does
 * not, because **the answer depends on time and on the viewer**. An
 * announcement becomes live at `starts_at` and stops at `ends_at`, so a cached
 * one under a global tag would appear late and — worse — linger after it
 * expired, with nothing to invalidate it because nothing *happened*: no write,
 * no tag, just a clock passing a value. And the forum-scoped ones are
 * permission-filtered, which is the one thing `cachedGlobal` exists to forbid
 * (invariant 9).
 *
 * The cost is one indexed query on the index and forum pages, over a table with
 * a handful of rows. That is the right trade rather than a concession: the
 * alternative is a TTL short enough not to matter, which is a cache that costs
 * a lookup and saves nothing.
 *
 * ## Rendered live, from source
 *
 * There is no `message_html`. A board has a few announcements and shows a few
 * per page, so storing a render would buy microseconds and cost a third
 * staleness predicate and a third backfill — including one for this feature's
 * own vocabulary, which would otherwise have to invalidate this table too.
 */
import { renderMarkdown, vocabularyOptions, type BoardVocabulary } from '@meith/markdown'
import { env, logger } from '@meith/core'
import { PostgresAnnouncementRepository, getDb, type AnnouncementRow } from '@meith/db'
import type { AnnouncementModel } from '@meith/theme-kit'

import { activeVocabulary } from './content-admin'
import { identitiesFor } from './group-identity'
import { forumHref } from '../view/board-index'
import { distinctUserIds, nameClassOf, type MemberIdentity } from '../view/member-identity'
import { formatTime } from '../view/time'

export function announcementRepository(): PostgresAnnouncementRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresAnnouncementRepository(getDb()) : null
}

/**
 * The announcements this viewer should see, already rendered.
 *
 * Failure-tolerant on purpose, and this is the one place on the board where
 * that matters most: announcements are *chrome*. A board whose index will not
 * render because the announcements query failed is a board that is down over a
 * notice, so a failure logs and shows none.
 */
export async function liveAnnouncements(input: {
  readonly visibleForumIds: readonly number[]
  readonly scope?: number | null
  readonly now: Date
  readonly timeZone?: string | undefined
}): Promise<readonly AnnouncementModel[]> {
  const repository = announcementRepository()
  if (repository === null) return []

  try {
    const [rows, vocabulary] = await Promise.all([
      repository.live({
        now: input.now,
        visibleForumIds: input.visibleForumIds,
        scope: input.scope ?? null,
      }),
      activeVocabulary(),
    ])

    /*
     * The byline gets the author's group colour, like every other name on the
     * board.
     *
     * It did not, and that is the *partial* failure F73's colour was specified
     * against: applied at five call sites out of six, the same person is green
     * in a thread, green in a listing, and grey above them — which reads as a
     * rendering bug rather than as a missing feature. An announcement is the
     * board speaking, usually in an administrator's name, so it is the byline
     * where the hierarchy is most worth showing.
     *
     * `identitiesFor` is `React.cache`d and deduped, and an announcement page
     * has a handful of authors — usually one, usually already resolved by the
     * index's own call — so this is a map lookup far more often than a query.
     */
    const identities = await identitiesFor(
      distinctUserIds(rows.map((row) => row.authorUserId)),
    )

    return rows.map((row) => toModel(row, input.now, input.timeZone, vocabulary, identities))
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read announcements')
    return []
  }
}

function toModel(
  row: AnnouncementRow,
  now: Date,
  timeZone: string | undefined,
  vocabulary: BoardVocabulary | undefined,
  identities: ReadonlyMap<number, MemberIdentity>,
): AnnouncementModel {
  return {
    title: row.title,
    /* Trusted HTML, this package's own construction — same as a post body. */
    bodyHtml: renderMarkdown(row.message, vocabularyOptions(vocabulary)).html,
    postedBy:
      row.authorUsername === ''
        ? null
        : {
            userId: row.authorUserId,
            username: row.authorUsername,
            /*
             * A deleted account keeps its name and loses its link, the same
             * rule every other attribution on this board follows.
             */
            profileHref: row.authorUserId === null ? null : `/member/${row.authorUserId}`,
            nameClass: nameClassOf(identities, row.authorUserId),
          },
    postedAt: formatTime(row.startsAt, now, timeZone),
    forum:
      row.forumId === null || row.forumTitle === null || row.forumSlug === null
        ? null
        : {
            label: row.forumTitle,
            href: forumHref({ id: row.forumId, slug: row.forumSlug }),
          },
  }
}
