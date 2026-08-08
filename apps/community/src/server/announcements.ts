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
 * no tag, just a clock passing a value. And the community-scoped ones are
 * permission-filtered, which is the one thing `cachedGlobal` exists to forbid
 * (invariant 9).
 *
 * The cost is one indexed query on the index and community pages, over a table with
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
import { communityHref } from '../view/board-index'
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
  readonly visibleCommunityIds: readonly number[]
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
        visibleCommunityIds: input.visibleCommunityIds,
        scope: input.scope ?? null,
      }),
      activeVocabulary(),
    ])

    return rows.map((row) => toModel(row, input.now, input.timeZone, vocabulary))
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
          },
    postedAt: formatTime(row.startsAt, now, timeZone),
    community:
      row.communityId === null || row.communityTitle === null || row.communitySlug === null
        ? null
        : {
            label: row.communityTitle,
            href: communityHref({ id: row.communityId, slug: row.communitySlug }),
          },
  }
}
