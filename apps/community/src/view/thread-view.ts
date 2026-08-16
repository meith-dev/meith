import {
  postBodyHtml,
  type BoardVocabulary,
  type CompiledWordFilter,
} from '@meith/markdown'
import { suppress } from '@meith/relations'
import type { ForumRow } from '@meith/forums'
import type {
  PaginationModel,
  PostAttachmentModel,
  PostBitModel,
  ThreadViewModel,
} from '@meith/theme-kit'
import { editedNote, type PostListingRow, type PostPage } from '@meith/posts'
import type { ThreadListingRow } from '@meith/threads'

import { forumHref } from './board-index'
import { threadRowModel } from './forum-display'
import { memberHref } from './member-profile'
import { postAnchor } from './post-link'
import type { MemberIdentity } from './member-identity'
import { formatDate, formatTime } from './time'
import { filterWords } from './word-filter'

export interface PostCapabilities {
  readonly viewerUserId: number | null
  readonly editOwn: boolean
  readonly editOthers: boolean
  readonly softDelete: boolean
  readonly restore: boolean
  readonly editWindowMinutes: number
  readonly bypassesWindow: boolean
  readonly canReport: boolean
  readonly canWarn: boolean
  readonly canRate?: boolean
  readonly ratingNeedsForm?: boolean
}

const NO_CAPABILITIES: PostCapabilities = {
  viewerUserId: null,
  editOwn: false,
  editOthers: false,
  softDelete: false,
  restore: false,
  editWindowMinutes: 0,
  bypassesWindow: false,
  canReport: false,
  canWarn: false,
  canRate: false,
  ratingNeedsForm: true,
}

function withinEditWindow(
  post: PostListingRow,
  capabilities: PostCapabilities,
  now: Date,
): boolean {
  if (capabilities.bypassesWindow || capabilities.editWindowMinutes <= 0) return true
  const elapsed = (now.getTime() - post.createdAt.getTime()) / 60_000
  return elapsed <= capabilities.editWindowMinutes
}

interface PostContext {
  readonly now: Date
  readonly replyHref: string | null
  readonly capabilities: PostCapabilities
  readonly timeZone: string | undefined
  readonly fields: ReadonlyMap<number, readonly { label: string; value: string }[]>
  readonly signatures: ReadonlyMap<number, string>
  readonly avatars: ReadonlyMap<number, string>
  readonly identities: ReadonlyMap<number, MemberIdentity>
  readonly ignoredIds: ReadonlySet<number>
  readonly revealedPostIds: ReadonlySet<number>
  readonly revealHref: (postId: number, number: number) => string
  readonly wordFilter: CompiledWordFilter | undefined
  readonly vocabulary: BoardVocabulary | undefined
  readonly attachments: ReadonlyMap<number, readonly PostAttachmentModel[]>
}

function post(
  post: PostListingRow,
  thread: ThreadListingRow,
  context: PostContext,
): PostBitModel {
  const { now, replyHref, capabilities, timeZone, fields, signatures } = context
  const isOwn =
    capabilities.viewerUserId !== null && post.authorUserId === capabilities.viewerUserId
  const manageHref = `/thread/${thread.id}-${thread.slug}/edit?post=${post.id}`

  const hidden = suppress({
    authorUserId: post.authorUserId,
    viewerUserId: capabilities.viewerUserId,
    ignoredIds: context.ignoredIds,
    revealedPostIds: context.revealedPostIds,
    postId: post.id,
  })

  const identity =
    post.authorUserId === null ? undefined : context.identities.get(post.authorUserId)

  const mayEdit =
    post.visibility !== 'deleted' &&
    (isOwn
      ? capabilities.editOwn && withinEditWindow(post, capabilities, now)
      : capabilities.editOthers)

  return {
    id: post.id,
    number: post.number,
    permalink: `/thread/${thread.id}-${thread.slug}#${postAnchor(post.number)}`,
    quoteSource: hidden ? '' : post.message,
    author: {
      userId: post.authorUserId,
      username: post.authorUsername,
      profileHref: post.authorUserId === null ? null : memberHref(post.authorUserId),
      avatarUrl:
        hidden || post.authorUserId === null
          ? null
          : (context.avatars.get(post.authorUserId) ?? null),
      title: identity?.title ?? null,
      nameClass: identity?.nameClass ?? null,
      badge: identity?.badge ?? null,
      reputation: identity?.reputation ?? null,
      postCount: post.authorPostCount,
      joinedAt:
        post.authorJoinedAt === null ? null : formatDate(post.authorJoinedAt, timeZone),
      signatureHtml:
        hidden || post.authorUserId === null
          ? null
          : (signatures.get(post.authorUserId) ?? null),
      isOnline: false,
      fields:
        hidden || post.authorUserId === null ? [] : (fields.get(post.authorUserId) ?? []),
    },
    bodyHtml: hidden
      ? ''
      : filterWords(postBodyHtml(post, context.vocabulary), context.wordFilter),
    postedAt: formatTime(post.createdAt, now, timeZone),
    editedNote: editedNote(
      { editedAt: post.editedAt, editedByUsername: post.editedByUsername, reason: post.editReason },
      (at) => formatTime(at, now, timeZone).label,
    ),
    isFirstPost: post.isFirstPost,
    visibility: post.visibility,
    attachments: hidden ? [] : (context.attachments.get(post.id) ?? []),
    ignored: hidden
      ? {
          authorUsername: post.authorUsername,
          revealHref: context.revealHref(post.id, post.number),
        }
      : null,
    actions: {
      quoteHref:
        replyHref === null || post.visibility !== 'visible' || hidden
          ? null
          : `${replyHref}?quote=${post.id}`,
      editHref: mayEdit ? manageHref : null,
      restoreHref:
        post.visibility === 'deleted' && capabilities.restore ? manageHref : null,
      reportHref:
        capabilities.canReport && !isOwn && post.visibility === 'visible'
          ? `/report?kind=post&id=${post.id}`
          : null,
      warnHref:
        capabilities.canWarn && !isOwn && post.authorUserId !== null
          ? `/moderation/warn?user=${post.authorUserId}&post=${post.id}`
          : null,
      rateHref:
        capabilities.canRate === true &&
        !isOwn &&
        post.authorUserId !== null &&
        !hidden &&
        (capabilities.ratingNeedsForm !== false)
          ? `/member/${post.authorUserId}/reputation?post=${post.id}`
          : null,
      moderateHref: null,
    },
  }
}

export interface ThreadViewInput {
  readonly thread: ThreadListingRow
  readonly forum: ForumRow
  readonly page: PostPage
  readonly pageNumber: number
  readonly pagination?: PaginationModel
  readonly nextHref: string | null
  readonly markReadAction?: string | null
  readonly replyHref?: string | null
  readonly capabilities?: PostCapabilities
  readonly now: Date
  readonly timeZone?: string
  readonly authorFields?: ReadonlyMap<number, readonly { label: string; value: string }[]>
  readonly signatures?: ReadonlyMap<number, string>
  readonly avatars?: ReadonlyMap<number, string>
  readonly identities?: ReadonlyMap<number, MemberIdentity>
  readonly attachments?: ReadonlyMap<number, readonly PostAttachmentModel[]>
  readonly ignoredIds?: ReadonlySet<number>
  readonly revealedPostIds?: ReadonlySet<number>
  readonly wordFilter?: CompiledWordFilter | undefined
  readonly vocabulary?: BoardVocabulary | undefined
  readonly currentHref?: string
}

const EMPTY_IDS: ReadonlySet<number> = new Set()
const EMPTY_SIGNATURES: ReadonlyMap<number, string> = new Map()
const EMPTY_ATTACHMENTS: ReadonlyMap<number, readonly PostAttachmentModel[]> = new Map()
const EMPTY_AVATARS: ReadonlyMap<number, string> = new Map()
const EMPTY_IDENTITIES: ReadonlyMap<number, MemberIdentity> = new Map()

export function revealHref(currentHref: string, postId: number, number: number): string {
  const [path = '', hash] = currentHref.split('#')
  void hash
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}reveal=${postId}#${postAnchor(number)}`
}

export function threadToolsHeading(isForumModerator: boolean): string {
  return isForumModerator ? 'Moderator tools' : 'Thread tools'
}

export function revealedFrom(raw: string | readonly string[] | undefined): ReadonlySet<number> {
  if (raw === undefined) return EMPTY_IDS
  const values = typeof raw === 'string' ? [raw] : raw
  const ids = new Set<number>()
  for (const value of values) {
    for (const part of value.split(',')) {
      const id = Number(part)
      if (Number.isInteger(id) && id > 0) ids.add(id)
    }
  }
  return ids
}

export interface ThreadView {
  readonly view: Omit<ThreadViewModel, 'regions'>
  readonly posts: readonly PostBitModel[]
  readonly pagination: PaginationModel
}

export function buildThreadView(input: ThreadViewInput): ThreadView {
  return {
    view: {
      thread: threadRowModel(input.thread, input.now, null, input.timeZone),
      forum: { label: input.forum.title, href: forumHref(input.forum) },
      replyHref: input.replyHref ?? null,
      markReadAction: input.markReadAction ?? null,
    },
    posts: input.page.rows.map((entry) =>
      post(entry, input.thread, {
        now: input.now,
        replyHref: input.replyHref ?? null,
        capabilities: input.capabilities ?? NO_CAPABILITIES,
        timeZone: input.timeZone,
        fields: input.authorFields ?? new Map(),
        signatures: input.signatures ?? EMPTY_SIGNATURES,
        attachments: input.attachments ?? EMPTY_ATTACHMENTS,
        avatars: input.avatars ?? EMPTY_AVATARS,
        identities: input.identities ?? EMPTY_IDENTITIES,
        ignoredIds: input.ignoredIds ?? EMPTY_IDS,
        revealedPostIds: input.revealedPostIds ?? EMPTY_IDS,
        revealHref: (postId, number) => revealHref(input.currentHref ?? '', postId, number),
        wordFilter: input.wordFilter,
        vocabulary: input.vocabulary,
      }),
    ),
    pagination: input.pagination ?? {
      page: input.pageNumber,
      pageCount: input.pageNumber,
      pageCountIsExact: false,
      pages: [{ page: input.pageNumber, href: '', isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  }
}
