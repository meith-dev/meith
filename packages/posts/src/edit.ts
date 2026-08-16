import { ValidationError } from '@meith/core'

export const MESSAGE_MIN = 1

export interface EditablePost {
  readonly id: number
  readonly threadId: number
  readonly forumId: number
  readonly authorUserId: number | null
  readonly subject: string | null
  readonly message: string
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly isFirstPost: boolean
  readonly revisionCount: number
  readonly createdAt: Date
}

export interface PostEditTarget {
  readonly post: EditablePost
  readonly thread: {
    readonly id: number
    readonly slug: string
    readonly title: string
    readonly isLocked: boolean
    readonly visibility: 'visible' | 'unapproved' | 'deleted'
  }
  readonly forum: { readonly id: number; readonly slug: string; readonly isOpen: boolean }
}

export interface EditCapabilities {
  readonly isOwn: boolean
  readonly editWindowMinutes: number
  readonly bypassesWindow: boolean
  readonly bypassesLock: boolean
  readonly requiresApprovalOnEdit: boolean
  readonly bypassesModeration: boolean
}

export interface EditPostInput {
  readonly message: string
  readonly reason: string
  readonly capabilities: EditCapabilities
}

export interface PostEditRecord {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorUserId: number | null
  readonly isFirstPost: boolean
  readonly message: string
  readonly reason: string | null
  readonly editedByUserId: number
  readonly editedAt: Date
  readonly silent: boolean
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
  readonly changed: boolean
  readonly heldForApproval: boolean
}

export interface PostVisibilityRecord {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
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
  readonly changed: boolean
}

export interface PostWriteRepository {
  findEditTarget(threadId: number, postId: number): Promise<PostEditTarget | null>

  applyEdit(record: PostEditRecord): Promise<void>

  applyVisibility(record: PostVisibilityRecord): Promise<boolean>
}

export interface PostEditorConfig {
  readonly maxLength: number
  readonly editGraceSeconds: number
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
    const { post, thread, forum } = target
    const capabilities = input.capabilities

    if (post.visibility === 'deleted') {
      throw new ValidationError('That post has been deleted.')
    }
    if (thread.visibility !== 'visible') {
      throw new ValidationError('That thread is not available.')
    }
    if (thread.isLocked && !capabilities.bypassesLock) {
      throw new ValidationError('This thread is locked.')
    }
    if (!forum.isOpen && !capabilities.bypassesLock) {
      throw new ValidationError('This forum is closed.')
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
    const at = this.now()
    await this.posts.applyEdit({
      postId: post.id,
      threadId: post.threadId,
      forumId: post.forumId,
      authorUserId: post.authorUserId,
      isFirstPost: post.isFirstPost,
      message,
      reason: reason.length === 0 ? null : reason,
      editedByUserId: editorUserId,
      editedAt: at,
      silent: this.withinGrace(capabilities, post, at),
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

  async softDelete(
    actorUserId: number,
    target: PostEditTarget,
    capabilities: { readonly bypassesLock: boolean },
  ): Promise<PostVisibilityChange> {
    const { post, thread } = target

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
      forumId: post.forumId,
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
      forumId: post.forumId,
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

  private withinGrace(
    capabilities: EditCapabilities,
    post: EditablePost,
    at: Date,
  ): boolean {
    if (!capabilities.isOwn) return false

    const grace = this.config.editGraceSeconds
    if (!Number.isFinite(grace) || grace <= 0) return false

    return (at.getTime() - post.createdAt.getTime()) / 1000 <= grace
  }

  private enforceEditWindow(
    capabilities: EditCapabilities,
    post: EditablePost,
  ): void {
    if (!capabilities.isOwn || capabilities.bypassesWindow) return
    if (capabilities.editWindowMinutes <= 0) return

    const elapsedMinutes =
      (this.now().getTime() - post.createdAt.getTime()) / 60_000
    if (elapsedMinutes <= capabilities.editWindowMinutes) return

    throw new ValidationError(
      `Posts can only be edited for ${capabilities.editWindowMinutes} minutes after posting.`,
    )
  }
}

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
