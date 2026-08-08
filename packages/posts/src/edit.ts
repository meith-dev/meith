/**
 * F41 — editing a post, and taking one back.
 *
 * The ⛔ gate for content mutation. Everything downstream of it — the
 * moderation queue, thread tools, merge and split — is a different actor
 * performing one of the two transitions defined here, so both are written once,
 * in one place, with the counter consequences attached.
 *
 * As with F39/F40, this file decides what is *allowed*, never *who* is allowed:
 * whether an actor may edit their own post, or anyone's, is
 * `authorization.can(actor, 'post.editOwn' | 'post.editOthers', …)` and belongs
 * to the caller, because group and matrix reasoning never leaves
 * `@meith/authorization` (R4). What arrives here is a decision already made,
 * expressed as capabilities.
 */
import { ValidationError } from '@meith/core'

/** The shortest a post body may be. Matches the composer's rule (F39). */
export const MESSAGE_MIN = 1

export interface EditablePost {
  readonly id: number
  readonly threadId: number
  readonly communityId: number
  readonly authorUserId: number | null
  readonly subject: string | null
  readonly message: string
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly isFirstPost: boolean
  /** Revisions already stored, so the next one's number needs no count query. */
  readonly revisionCount: number
  readonly createdAt: Date
}

/** Everything the edit and delete paths need about where the post lives. */
export interface PostEditTarget {
  readonly post: EditablePost
  readonly thread: {
    readonly id: number
    readonly slug: string
    /** Carried so the edit page needs no second read of the thread (F47). */
    readonly title: string
    readonly isLocked: boolean
    readonly visibility: 'visible' | 'unapproved' | 'deleted'
  }
  readonly community: { readonly id: number; readonly slug: string; readonly isOpen: boolean }
}

/**
 * What the caller has already resolved from the community matrix.
 *
 * `editWindowMinutes` is the combined `editTimeLimitMinutes` permission, where
 * **0 means unlimited** — R4.2's rule for every numeric, and the reason this is
 * a number rather than a deadline: combining happens in the Authorizer, and a
 * deadline computed there would have to be recomputed here anyway.
 */
export interface EditCapabilities {
  /** True when the actor is the post's author. Decided by the caller. */
  readonly isOwn: boolean
  readonly editWindowMinutes: number
  /** `post.editOthers` or community moderation: neither window nor lock applies. */
  readonly bypassesWindow: boolean
  readonly bypassesLock: boolean
  /** Community's `requiresApprovalOnEdit`, already combined. */
  readonly requiresApprovalOnEdit: boolean
  readonly bypassesModeration: boolean
}

export interface EditPostInput {
  readonly message: string
  /** Free text shown with the edit notice. Empty means "no reason given". */
  readonly reason: string
  readonly capabilities: EditCapabilities
}

/** What the repository persists for an edit. Already validated. */
export interface PostEditRecord {
  readonly postId: number
  readonly threadId: number
  readonly communityId: number
  readonly authorUserId: number | null
  readonly isFirstPost: boolean
  readonly message: string
  readonly reason: string | null
  readonly editedByUserId: number
  readonly editedAt: Date
  /** The body being replaced, stored as revision `revision`. */
  readonly previousMessage: string
  readonly previousSubject: string | null
  readonly revision: number
  readonly fromVisibility: 'visible' | 'unapproved'
  readonly toVisibility: 'visible' | 'unapproved'
}

export interface EditedPost {
  readonly postId: number
  readonly threadId: number
  readonly threadSlug: string
  /** False when the body was identical, so nothing was written. */
  readonly changed: boolean
  /** True when the edit sent a visible post back to the queue. */
  readonly heldForApproval: boolean
}

/** A soft-delete or a restore. The only two visibility moves F41 owns. */
export interface PostVisibilityRecord {
  readonly postId: number
  readonly threadId: number
  readonly communityId: number
  readonly authorUserId: number | null
  readonly isFirstPost: boolean
  readonly from: 'visible' | 'unapproved' | 'deleted'
  readonly to: 'visible' | 'deleted'
  readonly actedByUserId: number
  readonly at: Date
}

export interface PostVisibilityChange {
  readonly postId: number
  readonly threadId: number
  readonly threadSlug: string
  readonly to: 'visible' | 'deleted'
  /** False when the post was already in that state — a double submit. */
  readonly changed: boolean
}

export interface PostWriteRepository {
  /**
   * The post plus its thread and community, or null.
   *
   * Thread-scoped like F40's quote lookup, and for the same reason: taking the
   * thread as part of the lookup means a post id from a URL cannot address a
   * post in a community the actor was never authorised against.
   */
  findEditTarget(threadId: number, postId: number): Promise<PostEditTarget | null>

  /** Revision, post and any counter consequence, in one transaction. */
  applyEdit(record: PostEditRecord): Promise<void>

  /**
   * Move a post between visible and deleted.
   *
   * Returns false when the row was not in `from` — a double submit, a
   * concurrent moderator, a stale form. The caller reports it; nothing about it
   * is an error.
   */
  applyVisibility(record: PostVisibilityRecord): Promise<boolean>
}

export interface PostEditorConfig {
  readonly maxLength: number
}

export class PostEditor {
  private readonly posts: PostWriteRepository
  private readonly config: PostEditorConfig
  private readonly now: () => Date

  constructor(deps: {
    posts: PostWriteRepository
    config: PostEditorConfig
    now?: () => Date
  }) {
    this.posts = deps.posts
    this.config = deps.config
    this.now = deps.now ?? (() => new Date())
  }

  async edit(
    input: EditPostInput,
    editorUserId: number,
    target: PostEditTarget,
  ): Promise<EditedPost> {
    const { post, thread, community } = target
    const capabilities = input.capabilities

    /*
     * A deleted post is not editable, by anybody. Restoring it is a decision
     * about whether it should exist; editing it first would mean rewriting
     * content while it is invisible, which is how a restored post turns out to
     * say something nobody reviewed.
     */
    if (post.visibility === 'deleted') {
      throw new ValidationError('That post has been deleted.')
    }
    if (thread.visibility !== 'visible') {
      throw new ValidationError('That thread is not available.')
    }
    if (thread.isLocked && !capabilities.bypassesLock) {
      throw new ValidationError('This thread is locked.')
    }
    if (!community.isOpen && !capabilities.bypassesLock) {
      throw new ValidationError('This community is closed.')
    }

    this.enforceEditWindow(capabilities, post)

    const message = input.message.trim()
    if (message.length < MESSAGE_MIN) {
      throw new ValidationError('A post needs a message.')
    }
    if (message.length > this.config.maxLength) {
      throw new ValidationError(
        `A post may be at most ${this.config.maxLength} characters.`,
      )
    }

    /*
     * An identical body writes nothing: no revision, no edit notice, no
     * counter. A revision that records no change is noise in the history the
     * next moderator has to read, and an edit notice on a post nobody edited is
     * a false accusation in public.
     */
    if (message === post.message) {
      return {
        postId: post.id,
        threadId: thread.id,
        threadSlug: thread.slug,
        changed: false,
        heldForApproval: false,
      }
    }

    const from = post.visibility
    const held =
      from === 'visible' &&
      capabilities.requiresApprovalOnEdit &&
      !capabilities.bypassesModeration
    const to = held ? 'unapproved' : from

    const reason = input.reason.trim()
    await this.posts.applyEdit({
      postId: post.id,
      threadId: post.threadId,
      communityId: post.communityId,
      authorUserId: post.authorUserId,
      isFirstPost: post.isFirstPost,
      message,
      reason: reason.length === 0 ? null : reason,
      editedByUserId: editorUserId,
      editedAt: this.now(),
      previousMessage: post.message,
      previousSubject: post.subject,
      revision: post.revisionCount + 1,
      fromVisibility: from,
      toVisibility: to,
    })

    return {
      postId: post.id,
      threadId: thread.id,
      threadSlug: thread.slug,
      changed: true,
      heldForApproval: held,
    }
  }

  /**
   * Soft-delete a post.
   *
   * Soft, always: `visibility = 'deleted'` is reversible and leaves the row for
   * a moderator to look at, which is the entire reason the column has three
   * states. Destroying the row is `canDeleteOthersPosts`, and it belongs with
   * the moderation tools that can also explain what was destroyed (F50).
   */
  async softDelete(
    actorUserId: number,
    target: PostEditTarget,
    capabilities: { readonly bypassesLock: boolean },
  ): Promise<PostVisibilityChange> {
    const { post, thread } = target

    /*
     * The opening post is the thread. Deleting it would leave a thread whose
     * first post does not exist — a title, a reply count and nothing to read —
     * so it is refused here and belongs to the thread tools that can delete the
     * whole thing and move its counters as one act (F50). Saying so is the
     * point: silently deleting the thread instead would be a member clicking
     * "delete my post" and removing other people's replies.
     */
    if (post.isFirstPost) {
      throw new ValidationError(
        'The first post of a thread cannot be deleted on its own. Delete the thread instead.',
      )
    }
    if (post.visibility === 'deleted') {
      throw new ValidationError('That post has already been deleted.')
    }
    if (thread.isLocked && !capabilities.bypassesLock) {
      throw new ValidationError('This thread is locked.')
    }

    const changed = await this.posts.applyVisibility({
      postId: post.id,
      threadId: post.threadId,
      communityId: post.communityId,
      authorUserId: post.authorUserId,
      isFirstPost: post.isFirstPost,
      from: post.visibility,
      to: 'deleted',
      actedByUserId: actorUserId,
      at: this.now(),
    })

    return {
      postId: post.id,
      threadId: thread.id,
      threadSlug: thread.slug,
      to: 'deleted',
      changed,
    }
  }

  /** Put a soft-deleted post back. The caller has checked `post.softDelete`. */
  async restore(
    actorUserId: number,
    target: PostEditTarget,
  ): Promise<PostVisibilityChange> {
    const { post, thread } = target

    if (post.visibility !== 'deleted') {
      throw new ValidationError('That post is not deleted.')
    }

    const changed = await this.posts.applyVisibility({
      postId: post.id,
      threadId: post.threadId,
      communityId: post.communityId,
      authorUserId: post.authorUserId,
      isFirstPost: post.isFirstPost,
      from: 'deleted',
      to: 'visible',
      actedByUserId: actorUserId,
      at: this.now(),
    })

    return {
      postId: post.id,
      threadId: thread.id,
      threadSlug: thread.slug,
      to: 'visible',
      changed,
    }
  }

  /**
   * The edit window.
   *
   * Applies to your own post only. Someone editing *another* member's post is
   * doing so under `post.editOthers`, which is a moderation power — and a
   * moderator who cannot fix a two-year-old post because its author's window
   * closed is a rule aimed at the wrong person.
   */
  private enforceEditWindow(
    capabilities: EditCapabilities,
    post: EditablePost,
  ): void {
    if (!capabilities.isOwn || capabilities.bypassesWindow) return
    // R4.2: 0 is unlimited, and beats every other value across groups.
    if (capabilities.editWindowMinutes <= 0) return

    const elapsedMinutes =
      (this.now().getTime() - post.createdAt.getTime()) / 60_000
    if (elapsedMinutes <= capabilities.editWindowMinutes) return

    throw new ValidationError(
      `Posts can only be edited for ${capabilities.editWindowMinutes} minutes after posting.`,
    )
  }
}

/**
 * The "last edited by …" line.
 *
 * Assembled here rather than in the theme because a theme receives strings, not
 * decisions (R6) — and because whether the *reason* is shown is a product rule:
 * a reason exists to explain a change to readers, so it is shown to everyone or
 * it should not have been asked for.
 */
export function editedNote(
  edit: {
    readonly editedAt: Date | null
    readonly editedByUsername: string | null
    readonly reason: string | null
  },
  formatTime: (at: Date) => string,
): string | null {
  if (edit.editedAt === null) return null
  const who = edit.editedByUsername === null ? 'a deleted account' : edit.editedByUsername
  const base = `Last edited by ${who} on ${formatTime(edit.editedAt)}`
  return edit.reason === null ? `${base}.` : `${base}: ${edit.reason}`
}
