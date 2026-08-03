/**
 * F79 — what each hook is handed.
 *
 * One entry per hook in `HOOKS`, both directions asserted at the bottom, so a
 * hook without a payload (or a payload without a hook) fails `pnpm typecheck`
 * rather than surfacing as `unknown` inside a plugin.
 *
 * ## Every hook has the same shape: a value and a context
 *
 * `value` is the thing. For a **filter** it is what the handler returns a
 * replacement for; for an **event** it is what happened. `context` is the
 * surroundings — who, where, which thread — and is never returned by anything.
 *
 * Uniformity is worth more here than expressiveness. A plugin author learns one
 * signature, the host has one dispatch path, and the generated documentation has
 * one table shape. The alternative — a bespoke argument list per hook — reads
 * better in isolation and is unusable across eighty of them.
 *
 * ## The payload rule: plain data, and the actor is not in it
 *
 * Payloads are JSON-shaped, for the same reasons view models are (they cross to
 * the outbox, to a webhook, and into a log). And they carry a **viewer** —
 * `{ userId, isGuest }` — never an `Actor`.
 *
 * That is a security boundary, not an ergonomic one. An `Actor` carries resolved
 * group membership and is the input to `authorization.can()`; handing one to a
 * plugin invites the plugin to make its own permission decision from the group
 * ids, which is exactly what R4 forbids of core code and doubly so of code an
 * operator installed from a directory. Plugins are handed the *result* of
 * authorization — a link that is present or absent, a post that is in the list
 * or is not — and never its inputs.
 *
 * ## Ids, not rows
 *
 * Most event payloads are ids plus the few fields a handler cannot look up
 * cheaply. A plugin that needs the whole post can fetch it; a payload carrying
 * every row would be a second read model to keep in step with the schema, and
 * the first migration would break every plugin.
 */

import type {
  BoardIndexModel,
  BoardStatsModel,
  CategoryBlockModel,
  ErrorNoticeModel,
  FooterModel,
  ForumDisplayModel,
  ForumRowSlotModel,
  HeaderModel,
  MemberProfileModel,
  NavigationModel,
  NoticeModel,
  PaginationModel,
  PostActionsSlotModel,
  PostBitSlotModel,
  PostFormModel,
  RedirectNoticeModel,
  SearchFormModel,
  ShellModel,
  SubforumListModel,
  ThreadRowSlotModel,
  ThreadViewModel,
  UserPanelModel,
  WhoIsOnlineModel,
} from '@forum/theme-kit'

import type { HookName } from './hooks'

/* ------------------------------------------------------------------ *
 * Shared context pieces
 * ------------------------------------------------------------------ */

/**
 * Who is looking, as much as a plugin is told.
 *
 * Not an `Actor`. See this file's header — the omission is the point.
 */
export interface ViewerRef {
  readonly userId: number | null
  readonly isGuest: boolean
}

/** The request a hook is running inside, when there is one. */
export interface RequestRef {
  /** F09's correlation id, so a plugin's own logging joins up with the board's. */
  readonly requestId: string | null
}

export interface ForumRef {
  readonly forumId: number
}

export interface ThreadRef {
  readonly threadId: number
  readonly forumId: number
}

export interface PostRef {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
}

export interface UserRef {
  readonly userId: number
}

/** A moderator acting, with the reason they gave. */
export interface ModerationRef {
  readonly moderatorId: number
  readonly reason: string | null
}

/** A draft, as the composer has it before anything is written. */
export interface DraftPayload {
  readonly subject: string | null
  readonly body: string
  readonly prefixId: number | null
  readonly forumId: number
  readonly authorId: number
}

/** Validation messages. Empty means "no objection"; anything else refuses. */
export type ValidationMessages = readonly string[]

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

export interface HookSignatures {
  /* ---- Content rendering ---- */
  'bbcode.parse.text': { value: string; context: ViewerRef & { source: 'post' | 'signature' | 'pm' } }
  'bbcode.render.html': { value: string; context: ViewerRef & { source: 'post' | 'signature' | 'pm' } }
  'bbcode.tags': { value: readonly string[]; context: ForumRef | Record<string, never> }
  'post.body.html': { value: string; context: PostRef & ViewerRef }
  'signature.html': { value: string; context: ViewerRef & { authorId: number } }
  'smilies.list': {
    value: readonly { readonly code: string; readonly imageUrl: string }[]
    context: ViewerRef
  }
  'word-filter.patterns': {
    value: readonly { readonly pattern: string; readonly replacement: string }[]
    context: Record<string, never>
  }

  /* ---- View models ---- */
  'view.header': { value: HeaderModel; context: ViewerRef & RequestRef }
  'view.user-panel': { value: UserPanelModel; context: ViewerRef & RequestRef }
  'view.navigation': { value: NavigationModel; context: ViewerRef & RequestRef }
  'view.footer': { value: FooterModel; context: ViewerRef & RequestRef }
  'view.board-index': { value: BoardIndexModel; context: ViewerRef }
  'view.forum-row': { value: ForumRowSlotModel; context: ViewerRef }
  'view.thread-row': { value: ThreadRowSlotModel; context: ViewerRef & ForumRef }
  'view.post-bit': { value: PostBitSlotModel; context: ViewerRef & ThreadRef }
  'view.post-actions': { value: PostActionsSlotModel; context: ViewerRef & ThreadRef }
  'view.member-profile': { value: MemberProfileModel; context: ViewerRef }
  'view.board-stats': { value: BoardStatsModel; context: ViewerRef }
  'view.who-is-online': { value: WhoIsOnlineModel; context: ViewerRef }
  'view.pagination': { value: PaginationModel; context: ViewerRef }
  'view.search-form': { value: SearchFormModel; context: ViewerRef }
  'view.error-notice': { value: ErrorNoticeModel; context: ViewerRef & RequestRef }
  'view.shell': { value: ShellModel; context: ViewerRef & RequestRef }
  'view.notice': { value: NoticeModel; context: ViewerRef }
  'view.category-block': { value: CategoryBlockModel; context: ViewerRef }
  'view.subforum-list': { value: SubforumListModel; context: ViewerRef & ForumRef }
  'view.forum-display': { value: ForumDisplayModel; context: ViewerRef & ForumRef }
  'view.thread-view': { value: ThreadViewModel; context: ViewerRef & ThreadRef }
  'view.post-form': { value: PostFormModel; context: ViewerRef }
  'view.redirect-notice': { value: RedirectNoticeModel; context: ViewerRef }

  /* ---- Posting ---- */
  'thread.create.validate': { value: ValidationMessages; context: { draft: DraftPayload } }
  'thread.create.before': { value: DraftPayload; context: ViewerRef }
  'thread.created': { value: ThreadRef & { authorId: number; subject: string }; context: ViewerRef }
  'post.create.validate': { value: ValidationMessages; context: { draft: DraftPayload; threadId: number } }
  'post.create.before': { value: DraftPayload; context: ViewerRef & { threadId: number } }
  'post.created': { value: PostRef & { authorId: number }; context: ViewerRef }
  'post.edit.before': {
    value: { readonly body: string; readonly reason: string | null }
    context: PostRef & ViewerRef
  }
  'post.edited': { value: PostRef & { editorId: number; revision: number }; context: ViewerRef }
  'post.delete.before': { value: PostRef; context: ModerationRef }
  'post.deleted': { value: PostRef; context: ModerationRef }
  'post.restored': { value: PostRef; context: ModerationRef }
  'thread.moved': {
    value: { readonly threadId: number; readonly fromForumId: number; readonly toForumId: number }
    context: ModerationRef
  }
  'thread.merged': {
    value: { readonly keptThreadId: number; readonly mergedThreadId: number; readonly postCount: number }
    context: ModerationRef
  }
  'thread.split': {
    value: { readonly sourceThreadId: number; readonly newThreadId: number; readonly postCount: number }
    context: ModerationRef
  }
  'thread.locked': { value: ThreadRef & { isLocked: boolean }; context: ModerationRef }
  'thread.stickied': { value: ThreadRef & { isSticky: boolean }; context: ModerationRef }
  'attachment.upload.validate': {
    value: ValidationMessages
    context: {
      readonly filename: string
      readonly bytes: number
      /** What the *bytes* say it is, not what the name claims. */
      readonly detectedMimeType: string
      readonly uploaderId: number
    }
  }
  'attachment.uploaded': {
    value: { readonly attachmentId: number; readonly postId: number | null; readonly bytes: number }
    context: ViewerRef
  }
  'attachment.deleted': { value: { readonly attachmentId: number }; context: ViewerRef }
  'poll.created': { value: ThreadRef & { pollId: number; optionCount: number }; context: ViewerRef }
  'poll.voted': { value: { readonly pollId: number; readonly optionId: number }; context: ViewerRef }
  'rating.recorded': {
    value: { readonly threadId: number; readonly rating: number; readonly average: number }
    context: ViewerRef
  }

  /* ---- Moderation ---- */
  'report.created': {
    value: {
      readonly reportId: number
      readonly target: 'post' | 'thread' | 'user' | 'pm'
      readonly targetId: number
      readonly reporterId: number
    }
    context: RequestRef
  }
  'report.resolved': {
    value: { readonly reportId: number; readonly resolution: 'actioned' | 'rejected' }
    context: ModerationRef
  }
  'approval.queued': {
    value: { readonly kind: 'thread' | 'post' | 'attachment'; readonly id: number }
    context: ViewerRef
  }
  'approval.decided': {
    value: {
      readonly kind: 'thread' | 'post' | 'attachment'
      readonly id: number
      readonly approved: boolean
    }
    context: ModerationRef
  }
  'warning.issued': {
    value: {
      readonly warningId: number
      readonly userId: number
      readonly points: number
      readonly expiresAt: string | null
    }
    context: ModerationRef
  }
  'warning.revoked': { value: { readonly warningId: number; readonly userId: number }; context: ModerationRef }
  'moderation.logged': {
    value: { readonly action: string; readonly targetId: number | null }
    context: ModerationRef
  }

  /* ---- Identity ---- */
  'user.register.validate': {
    value: ValidationMessages
    context: { readonly username: string; readonly email: string; readonly ipPrefix: string | null }
  }
  'user.registered': { value: UserRef & { username: string; requiresActivation: boolean }; context: RequestRef }
  'user.activated': { value: UserRef; context: RequestRef }
  'user.login.attempted': {
    value: {
      readonly username: string
      readonly outcome: 'ok' | 'bad-credentials' | 'locked-out' | 'banned'
      /** Truncated as F09 requires. Never a full address. */
      readonly ipPrefix: string | null
    }
    context: RequestRef
  }
  'user.logged-in': { value: UserRef; context: RequestRef }
  'user.logged-out': { value: UserRef & { reason: 'requested' | 'revoked' }; context: RequestRef }
  'user.banned': {
    value: UserRef & { expiresAt: string | null }
    context: ModerationRef
  }
  'user.unbanned': { value: UserRef & { expired: boolean }; context: ModerationRef }
  'user.groups.changed': {
    value: UserRef & { primaryGroupId: number; secondaryGroupIds: readonly number[] }
    context: RequestRef
  }
  'user.profile.updated': { value: UserRef & { fields: readonly string[] }; context: RequestRef }
  'user.merged': { value: { readonly keptUserId: number; readonly mergedUserId: number }; context: RequestRef }
  'user.deleted': { value: UserRef & { reason: 'pruned' | 'deleted' }; context: RequestRef }

  /* ---- Mail, notifications, messages ---- */
  'notification.create.before': {
    value: {
      readonly userId: number
      readonly kind: string
      readonly subjectText: string
      readonly href: string
    } | null
    context: RequestRef
  }
  'notification.created': { value: { readonly notificationId: number; readonly userId: number }; context: RequestRef }
  'mail.send.before': {
    value: {
      readonly to: string
      readonly subject: string
      readonly textBody: string
      readonly htmlBody: string | null
    } | null
    context: { readonly template: string }
  }
  'mail.sent': { value: { readonly to: string; readonly template: string }; context: RequestRef }
  'pm.send.before': {
    value: {
      readonly senderId: number
      readonly recipientIds: readonly number[]
      readonly subject: string
      readonly body: string
    } | null
    context: RequestRef
  }
  'pm.sent': { value: { readonly messageId: number; readonly recipientIds: readonly number[] }; context: RequestRef }
  'subscription.changed': {
    value: {
      readonly userId: number
      readonly target: 'thread' | 'forum'
      readonly targetId: number
      readonly subscribed: boolean
    }
    context: RequestRef
  }
  'reputation.changed': {
    value: { readonly userId: number; readonly delta: number; readonly total: number }
    context: ViewerRef
  }

  /* ---- Search, discovery, syndication ---- */
  'search.query.before': { value: string; context: ViewerRef }
  'search.results': {
    value: readonly { readonly postId: number; readonly threadId: number; readonly rank: number }[]
    context: ViewerRef & { terms: string }
  }
  'feed.items': {
    value: readonly {
      readonly title: string
      readonly href: string
      readonly publishedAt: string
      readonly summary: string
    }[]
    /** Always a guest: a feed is cached under a shared URL (D82). */
    context: { readonly feed: 'board' | 'forum' | 'thread' }
  }
  'sitemap.entries': {
    value: readonly { readonly href: string; readonly lastModified: string | null }[]
    context: { readonly chunk: number }
  }
  'metadata.page': {
    value: {
      readonly title: string
      readonly description: string | null
      readonly canonical: string
      readonly imageUrl: string | null
    }
    context: { readonly route: string }
  }

  /* ---- Admin and system ---- */
  'admin.navigation': {
    value: readonly { readonly label: string; readonly href: string }[]
    context: ViewerRef
  }
  'settings.saved': { value: { readonly keys: readonly string[] }; context: { readonly adminId: number } }
  'task.run.before': { value: { readonly taskId: string }; context: Record<string, never> }
  'task.run.after': {
    value: { readonly taskId: string; readonly ok: boolean; readonly durationMs: number }
    context: Record<string, never>
  }
  'cache.invalidated': { value: { readonly tag: string }; context: Record<string, never> }
  'plugin.enabled': { value: { readonly pluginKey: string }; context: Record<string, never> }
  'plugin.disabled': {
    value: { readonly pluginKey: string; readonly reason: 'operator' | 'failures' }
    context: Record<string, never>
  }
}

/** What a handler for `K` is given. */
export type HookValue<K extends HookName> = HookSignatures[K]['value']
export type HookContext<K extends HookName> = HookSignatures[K]['context']

/* ------------------------------------------------------------------ *
 * Compile-time proofs
 * ------------------------------------------------------------------ */

/** Fails with the offending name in the message rather than a bare `never`. */
type AssertNever<T extends never> = T

type _NoHookWithoutSignature = AssertNever<Exclude<HookName, keyof HookSignatures>>
type _NoSignatureWithoutHook = AssertNever<Exclude<keyof HookSignatures, HookName>>
