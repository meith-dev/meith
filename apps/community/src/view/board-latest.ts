import type { Translator } from '@meith/i18n'
import { type CompiledWordFilter, summarise } from '@meith/markdown'
import type {
  LatestPostModel,
  LatestPostsModel,
  LatestThreadModel,
  LatestThreadsModel,
} from '@meith/theme-kit'

import { forumHref } from './board-index'
import { count } from './count'
import { type MemberIdentity, nameClassOf } from './member-identity'
import { memberHref } from './member-profile'
import { postLink } from './post-link'
import { formatTime } from './time'
import { filterWords } from './word-filter'

export interface LatestThreadRow {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly createdAt: Date
}

export interface LatestPostRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly createdAt: Date
  readonly messageSource: string
}

export interface LatestInput<Row> {
  readonly rows: readonly Row[]
  readonly now: Date
  readonly t?: Translator | undefined
  readonly identities?: ReadonlyMap<number, MemberIdentity>
  readonly wordFilter?: CompiledWordFilter | undefined
}

const EXCERPT_CHARS = 140

function postHref(row: LatestPostRow): string {
  return postLink(`/thread/${row.threadId}-${row.threadSlug}`, row.postId)
}

function authorOf(
  row: { authorUserId: number | null; authorUsername: string },
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
) {
  return {
    userId: row.authorUserId,
    username: row.authorUsername,
    profileHref: row.authorUserId === null ? null : memberHref(row.authorUserId),
    nameClass: nameClassOf(identities, row.authorUserId),
  }
}

export function buildLatestThreadsModel(input: LatestInput<LatestThreadRow>): LatestThreadsModel {
  const threads: LatestThreadModel[] = input.rows.map((row) => ({
    title: filterWords(row.title, input.wordFilter),
    href: `/thread/${row.threadId}-${row.slug}`,
    forum: {
      label: row.forumTitle,
      href: forumHref({ id: row.forumId, slug: row.forumSlug }),
    },
    author: authorOf(row, input.identities),
    replyCount: count(row.replyCount, input.t),
    startedAt: formatTime(row.createdAt, input.now, input.t),
  }))

  return { threads, capturedAt: formatTime(input.now, input.now, input.t) }
}

export function buildLatestPostsModel(input: LatestInput<LatestPostRow>): LatestPostsModel {
  const posts: LatestPostModel[] = input.rows.map((row) => ({
    threadTitle: filterWords(row.threadTitle, input.wordFilter),
    href: postHref(row),
    forum: {
      label: row.forumTitle,
      href: forumHref({ id: row.forumId, slug: row.forumSlug }),
    },
    author: authorOf(row, input.identities),
    excerpt: filterWords(summarise(row.messageSource, EXCERPT_CHARS), input.wordFilter),
    postedAt: formatTime(row.createdAt, input.now, input.t),
  }))

  return { posts, capturedAt: formatTime(input.now, input.now, input.t) }
}
