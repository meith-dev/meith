import 'server-only'

import { renderMarkdown, vocabularyOptions, type BoardVocabulary } from '@meith/markdown'
import { env, logger } from '@meith/core'
import { PostgresAnnouncementRepository, getDb, type AnnouncementRow } from '@meith/db'
import type { AnnouncementModel } from '@meith/theme-kit'

import { activeVocabulary } from './content-admin'
import { forumHref } from '../view/board-index'
import { formatTime } from '../view/time'

export function announcementRepository(): PostgresAnnouncementRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresAnnouncementRepository(getDb()) : null
}

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
    bodyHtml: renderMarkdown(row.message, vocabularyOptions(vocabulary)).html,
    postedBy:
      row.authorUsername === ''
        ? null
        : {
            userId: row.authorUserId,
            username: row.authorUsername,
            profileHref: row.authorUserId === null ? null : `/member/${row.authorUserId}`,
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
