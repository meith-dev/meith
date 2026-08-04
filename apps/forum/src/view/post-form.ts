/** F39's composer view model, and F41's edit frame. Pure: no container, no request, no clock. */
import type { PostFormModel } from '@meith/theme-kit'

export interface PostFormInput {
  readonly forum: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
}

/** The frame around the form. The form element itself is a region (D42). */
export function buildNewThreadView(
  input: PostFormInput,
): Omit<PostFormModel, 'regions'> {
  return {
    mode: 'thread',
    heading: `Post a new thread in ${input.forum.title}`,
    cancelHref: `/forum/${input.forum.id}-${input.forum.slug}`,
    cancelLabel: `Back to ${input.forum.title}`,
    errorMessage: input.errorMessage ?? null,
  }
}

export interface ReplyViewInput {
  readonly thread: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
}

/** The reply page's frame. Same slot, different heading and cancel target. */
export function buildReplyView(
  input: ReplyViewInput,
): Omit<PostFormModel, 'regions'> {
  return {
    mode: 'reply',
    heading: `Reply to ${input.thread.title}`,
    cancelHref: `/thread/${input.thread.id}-${input.thread.slug}`,
    cancelLabel: 'Back to the thread',
    errorMessage: input.errorMessage ?? null,
  }
}

export interface EditViewInput {
  readonly thread: { readonly id: number; readonly title: string; readonly slug: string }
  readonly postId: number
  /** A deleted post is managed, not edited: the page offers restore instead. */
  readonly isDeleted: boolean
  readonly errorMessage?: string | null
}

/**
 * The edit page's frame (F41).
 *
 * One route covers both states a post can be managed in, so the heading is what
 * tells the actor which one they are looking at. A separate `/restore` route
 * would double the surface to say the same thing, and would 404 the moment a
 * second moderator acted first.
 */
export function buildEditView(
  input: EditViewInput,
): Omit<PostFormModel, 'regions'> {
  return {
    mode: 'edit',
    heading: input.isDeleted ? 'Deleted post' : 'Edit post',
    cancelHref: `/thread/${input.thread.id}-${input.thread.slug}#post-${input.postId}`,
    cancelLabel: 'Back to the thread',
    errorMessage: input.errorMessage ?? null,
  }
}
