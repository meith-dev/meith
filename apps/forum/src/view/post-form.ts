/** F39's composer view model. Pure: no container, no request, no clock. */
import type { PostFormModel } from '@forum/theme-kit'

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
