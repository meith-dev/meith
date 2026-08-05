/** F31's pure thread-view model, with F41's edit and delete affordances. */
import {
  applyWordFilter,
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
import type { MemberIdentity } from './member-identity'
import { formatDate, formatTime } from './time'

/**
 * What this viewer may do to a post, already resolved by the page.
 *
 * Capabilities, not permissions: the matrix stays inside
 * `@meith/authorization` (R4), and what reaches the view model is a set of
 * answers. Every one of them is re-asked by the action that acts on it — a link
 * is not authorisation.
 */
export interface PostCapabilities {
  readonly viewerUserId: number | null
  readonly editOwn: boolean
  readonly editOthers: boolean
  readonly softDelete: boolean
  /**
   * The combined `editTimeLimitMinutes`, where 0 is unlimited (R4.2).
   *
   * Used only to *hide a link that would be refused*. The window is enforced by
   * `PostEditor`; repeating it here keeps the page from offering an Edit link on
   * a three-year-old post that the next screen will reject.
   */
  readonly editWindowMinutes: number
  /** Set when the actor may edit regardless of the window (moderation). */
  readonly bypassesWindow: boolean
  /** F49's global `content.report`. Guests and read-only groups hold it not. */
  readonly canReport: boolean
  /** F53's global `user.warn`. */
  readonly canWarn: boolean
  /** F62's global `reputation.give`, and the board setting behind it. */
  readonly canRate?: boolean
}

const NO_CAPABILITIES: PostCapabilities = {
  viewerUserId: null,
  editOwn: false,
  editOthers: false,
  softDelete: false,
  editWindowMinutes: 0,
  bypassesWindow: false,
  canReport: false,
  canWarn: false,
  canRate: false,
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

/**
 * Everything about *this viewer* that a post model needs.
 *
 * One object rather than six positional arguments, because F57 learned that
 * lesson the hard way: inserting `timeZone` before `canWarn` silently changed
 * what every caller meant. A named field cannot be transposed.
 */
interface PostContext {
  readonly now: Date
  readonly replyHref: string | null
  readonly capabilities: PostCapabilities
  readonly timeZone: string | undefined
  /** F59, resolved per author by the page. Empty for a board with no fields. */
  readonly fields: ReadonlyMap<number, readonly { label: string; value: string }[]>
  /** F58, resolved per author by the page. Empty when nobody has one. */
  readonly signatures: ReadonlyMap<number, string>
  /** F58's other half: an avatar URL per author, absent for most of them. */
  readonly avatars: ReadonlyMap<number, string>
  /**
   * The author's group, colour, badge and reputation, resolved per page.
   *
   * One query for every author on the page, for the reason every other map here
   * is a map: a postbit is rendered twenty times and resolving this per post is
   * the N+1 on the board's heaviest page.
   *
   * Absent for a deleted account, whose posts remain and whose name is still
   * shown — which is why every read of it falls back rather than asserting.
   */
  readonly identities: ReadonlyMap<number, MemberIdentity>
  /** F61. The ids this viewer ignores, and the posts they asked to see anyway. */
  readonly ignoredIds: ReadonlySet<number>
  readonly revealedPostIds: ReadonlySet<number>
  /** Where a reveal link points, given the post to reveal. */
  readonly revealHref: (postId: number) => string
  /**
   * F71's compiled word filter, or undefined on a board with none configured —
   * which is the common case and costs nothing.
   */
  readonly wordFilter: CompiledWordFilter | undefined
  /** The board's smilies and custom tags (F71). */
  readonly vocabulary: BoardVocabulary | undefined
  /**
   * F42, resolved for the whole page in one query and grouped by post.
   *
   * Only downloadable attachments are in here — a `pending` re-encode and a
   * failed one are absent, because a link to a file that is not there yet is
   * worse than the file appearing a minute later.
   */
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

  /*
   * F61. Resolved before anything else on the model is built, because it is
   * what decides whether the body, the signature and the custom fields are
   * assembled at all — "server-side ignore" means the text does not reach the
   * browser, not that it arrives with `display: none`.
   */
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
    permalink: `/thread/${thread.id}-${thread.slug}#post-${post.id}`,
    quoteSource: hidden ? '' : post.message,
    author: {
      userId: post.authorUserId,
      username: post.authorUsername,
      profileHref: post.authorUserId === null ? null : memberHref(post.authorUserId),
      /*
       * F58. Withheld with the body on a hidden post (F61), like the signature
       * above: an ignored author's picture is theirs too, and leaving it would
       * put a face on a post the reader chose not to read.
       */
      avatarUrl:
        hidden || post.authorUserId === null
          ? null
          : (context.avatars.get(post.authorUserId) ?? null),
      /*
       * The display group's title. This field has been in the theme contract
       * since F27 and was hardcoded `null` here, so every theme's postbit had a
       * place for a member's standing and nothing to put in it — while
       * `users.display_group_id` was written by three code paths and read by
       * none. Both ends existed; nothing joined them.
       */
      title: identity?.title ?? null,
      nameClass: identity?.nameClass ?? null,
      /*
       * Kept on a hidden post, unlike the avatar. F61's ignore is about the
       * author's *own* material — their words, their signature, the picture
       * they chose — and a group badge is none of those: it is the board's
       * image, uploaded by an administrator, saying which group this is. So is
       * the title beside it. Withholding them would hide the board's own
       * labelling from the reader who most needs it to judge the post.
       */
      badge: identity?.badge ?? null,
      /*
       * Not withheld, for the same reason `postCount` and `joinedAt` two lines
       * down are not: a number about an account is not the author's content.
       */
      reputation: identity?.reputation ?? null,
      postCount: post.authorPostCount,
      /*
       * A date, not a timestamp. This read `formatTime` and therefore rendered
       * "Joined 1 Jan, 00:00" — the minute an account was registered is not
       * something any reader has ever wanted, and inside the current year the
       * *year* was dropped in its place, which is the half that is actually
       * informative here.
       */
      joinedAt:
        post.authorJoinedAt === null ? null : formatDate(post.authorJoinedAt, timeZone),
      /*
       * F58. Withheld with the body when the post is hidden (F61) — a
       * signature is the author's text too, and leaving it would put it back on
       * a post the reader chose not to read.
       */
      signatureHtml:
        hidden || post.authorUserId === null
          ? null
          : (signatures.get(post.authorUserId) ?? null),
      isOnline: false,
      /*
       * F59. Keyed by author rather than by post, because a thread is mostly
       * the same few people and resolving per post would repeat the work.
       */
      fields:
        hidden || post.authorUserId === null ? [] : (fields.get(post.authorUserId) ?? []),
    },
    /*
     * The only place a post body becomes markup (F36). `postBodyHtml` prefers
     * the render stored with the post and falls back to rendering the source
     * here when that render is missing, was produced by an older version of the
     * renderer, or belongs to a body still stored as BBCode — so a body is
     * never shown by a renderer other than the current one, and never fails to
     * be shown because a task has not caught up.
     */
    /*
     * F71's word filter runs here, on the rendered markup, and never on what is
     * stored — so removing a filter restores the word on the next render. It is
     * applied at this one site rather than inside `postBodyHtml` because the
     * same renderer serves private messages, and filtering private
     * correspondence between two members is a different decision from filtering
     * what the board publishes. See D75.
     */
    /*
     * F71's vocabulary goes *into* `postBodyHtml` and the word filter is
     * applied *after* it, and the order is the difference between the two
     * features. Smilies and directives decide what the stored render contains,
     * so they are part of the question "is this render current"; the filter is
     * a view of finished markup, which is what makes it reversible.
     */
    bodyHtml: hidden
      ? ''
      : context.wordFilter === undefined
        ? postBodyHtml(post, context.vocabulary)
        : applyWordFilter(postBodyHtml(post, context.vocabulary), context.wordFilter),
    postedAt: formatTime(post.createdAt, now, timeZone),
    /*
     * Shown to everyone who can see the post, reason included. An edit notice
     * exists to tell readers the text changed after they might have read it;
     * showing it selectively would defeat the point.
     */
    editedNote: editedNote(
      { editedAt: post.editedAt, editedByUsername: post.editedByUsername, reason: post.editReason },
      (at) => formatTime(at, now, timeZone).label,
    ),
    isFirstPost: post.isFirstPost,
    visibility: post.visibility,
    /*
     * F42. Withheld with the body when the post is hidden (F61): an ignored
     * author's images are their content too, and a row of thumbnails under a
     * "post hidden" placeholder would be the ignore doing nothing.
     */
    attachments: hidden ? [] : (context.attachments.get(post.id) ?? []),
    ignored: hidden
      ? {
          authorUsername: post.authorUsername,
          revealHref: context.revealHref(post.id),
        }
      : null,
    actions: {
      /*
       * Quoting is the reply form with a prefill, so it is the same route and
       * the same permission — there is no separate "may quote" to resolve, and
       * an actor who cannot reply is offered neither. A deleted post is not
       * quotable: its body is only on the page because a moderator is reading it.
       */
      quoteHref:
        replyHref === null || post.visibility !== 'visible' || hidden
          ? null
          : `${replyHref}?quote=${post.id}`,
      editHref: mayEdit ? manageHref : null,
      restoreHref:
        post.visibility === 'deleted' && capabilities.softDelete ? manageHref : null,
      /*
       * Reporting your own post is not offered — it is a button that files a
       * complaint about yourself, and the only person it ever helps is somebody
       * flooding the queue. A deleted post is not reportable either: it is only
       * on this page because a moderator is reading it.
       */
      reportHref:
        capabilities.canReport && !isOwn && post.visibility === 'visible'
          ? `/report?kind=post&id=${post.id}`
          : null,
      /*
       * The author, cited by this post. Not offered for your own post — a
       * warning you issue to yourself trips the same level actions as one
       * anybody else issues — nor for a post whose author no longer exists.
       */
      warnHref:
        capabilities.canWarn && !isOwn && post.authorUserId !== null
          ? `/moderation/warn?user=${post.authorUserId}&post=${post.id}`
          : null,
      /*
       * F62. Not offered on your own post — rating yourself is refused by the
       * service, so a link to it would only ever lead to a refusal — nor on a
       * post whose author no longer exists, nor on a hidden one: the reader
       * chose not to read it, and inviting them to rate it is absurd.
       */
      rateHref:
        capabilities.canRate === true && !isOwn && post.authorUserId !== null && !hidden
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
  readonly nextHref: string | null
  readonly markReadAction?: string | null
  /** Where the reply form lives, or `null` when this viewer may not reply. */
  readonly replyHref?: string | null
  /** F41. Omitted for a guest, who may do nothing to a post. */
  readonly capabilities?: PostCapabilities
  readonly now: Date
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
  readonly timeZone?: string
  /** F59's postbit fields, keyed by author user id. */
  readonly authorFields?: ReadonlyMap<number, readonly { label: string; value: string }[]>
  /** F58's rendered signatures, keyed by author user id. */
  readonly signatures?: ReadonlyMap<number, string>
  /** F58. Avatar URLs by author id. Empty on a board where nobody set one. */
  readonly avatars?: ReadonlyMap<number, string>
  /**
   * The group standing of every author on the page: title, colour class, badge
   * and reputation.
   *
   * Optional, and empty is a real answer rather than a missing one — a board on
   * sample data has no groups repository, and a board whose groups are all
   * unstyled produces the same map. Both render exactly as this page did
   * before, which is what makes it safe for every other caller to omit.
   */
  readonly identities?: ReadonlyMap<number, MemberIdentity>
  /** F42. Downloadable attachments, by post id. Empty on most pages. */
  readonly attachments?: ReadonlyMap<number, readonly PostAttachmentModel[]>
  /** F61. The ids this viewer ignores; empty for a guest or a board with none. */
  readonly ignoredIds?: ReadonlySet<number>
  /** F61. The posts this viewer has asked to see anyway, from `?reveal=`. */
  readonly revealedPostIds?: ReadonlySet<number>
  /**
   * F71's compiled word filter. Absent on a board with no filters configured,
   * which is the common case and costs nothing.
   */
  readonly wordFilter?: CompiledWordFilter | undefined
  readonly vocabulary?: BoardVocabulary | undefined
  /**
   * The page's own URL, so a reveal link can point back at it.
   *
   * Supplied by the page rather than assembled here, because the thread URL
   * already carries a page number and an anchor and this must not lose either
   * — a reveal that dumps the reader back on page 1 is worse than no reveal.
   */
  readonly currentHref?: string
}

const EMPTY_IDS: ReadonlySet<number> = new Set()
const EMPTY_SIGNATURES: ReadonlyMap<number, string> = new Map()
const EMPTY_ATTACHMENTS: ReadonlyMap<number, readonly PostAttachmentModel[]> = new Map()
const EMPTY_AVATARS: ReadonlyMap<number, string> = new Map()
const EMPTY_IDENTITIES: ReadonlyMap<number, MemberIdentity> = new Map()

/**
 * The same page with one more post revealed.
 *
 * Additive: revealing a second post keeps the first revealed, so working down
 * a thread does not mean re-hiding what you just chose to read. The anchor is
 * moved to the post itself, which is where the reader was looking.
 */
export function revealHref(currentHref: string, postId: number): string {
  const [path = '', hash] = currentHref.split('#')
  void hash
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}reveal=${postId}#post-${postId}`
}

/** Read `?reveal=` without trusting it. Repeated values are all honoured. */
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
        revealHref: (postId) => revealHref(input.currentHref ?? '', postId),
        wordFilter: input.wordFilter,
        vocabulary: input.vocabulary,
      }),
    ),
    pagination: {
      page: input.pageNumber,
      pageCount: input.pageNumber,
      pages: [{ page: input.pageNumber, href: '', isCurrent: true }],
      previousHref: null,
      nextHref: input.nextHref,
    },
  }
}
