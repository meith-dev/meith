import type { PostFormModel } from '@meith/theme-kit'

import { postAnchor } from './post-anchor'

export interface PostFormInput {
  readonly forum: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
}

export function buildNewThreadView(
  input: PostFormInput,
): Omit<PostFormModel, 'regions'> {
  return {
    mode: 'thread',
    heading: `Post a new thread in ${input.forum.title}`,
    cancelHref: `/${input.forum.id}-${input.forum.slug}`,
    cancelLabel: `Back to ${input.forum.title}`,
    errorMessage: input.errorMessage ?? null,
  }
}

export interface ReplyViewInput {
  readonly thread: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
}

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
  readonly isDeleted: boolean
  readonly errorMessage?: string | null
}

export function buildEditView(
  input: EditViewInput,
): Omit<PostFormModel, 'regions'> {
  return {
    mode: 'edit',
    heading: input.isDeleted ? 'Deleted post' : 'Edit post',
    cancelHref: `/thread/${input.thread.id}-${input.thread.slug}#${postAnchor(input.postId)}`,
    cancelLabel: 'Back to the thread',
    errorMessage: input.errorMessage ?? null,
  }
}
