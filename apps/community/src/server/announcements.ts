import 'server-only'

import { env, logger } from '@meith/core'
import { type AnnouncementRow, getDb, PostgresAnnouncementRepository } from '@meith/db'
import type { Translator } from '@meith/i18n'
import { type BoardVocabulary, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import type { AnnouncementModel } from '@meith/theme-kit'

import { forumHref } from '../view/board-index'
import { distinctUserIds, type MemberIdentity, nameClassOf } from '../view/member-identity'
import { formatTime } from '../view/time'
import { activeVocabulary } from './content-admin'
import { identitiesFor } from './group-identity'

export function announcementRepository(): PostgresAnnouncementRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresAnnouncementRepository(getDb()) : null
}

export async function liveAnnouncements(input: {
  readonly visibleForumIds: readonly number[]
  readonly scope?: number | null
  readonly now: Date
  readonly t?: Translator | undefined
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

    const identities = await identitiesFor(distinctUserIds(rows.map((row) => row.authorUserId)))

    return rows.map((row) => toModel(row, input.now, input.t, vocabulary, identities))
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read announcements')
    return []
  }
}

function toModel(
  row: AnnouncementRow,
  now: Date,
  translator: Translator | undefined,
  vocabulary: BoardVocabulary | undefined,
  identities: ReadonlyMap<number, MemberIdentity>,
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
            nameClass: nameClassOf(identities, row.authorUserId),
          },
    postedAt: formatTime(row.startsAt, now, translator),
    forum:
      row.forumId === null || row.forumTitle === null || row.forumSlug === null
        ? null
        : {
            label: row.forumTitle,
            href: forumHref({ id: row.forumId, slug: row.forumSlug }),
          },
  }
}
