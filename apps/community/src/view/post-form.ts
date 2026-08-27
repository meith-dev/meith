import type { Translator } from '@meith/i18n'
import type { CompiledWordFilter } from '@meith/markdown'
import type { PostFormModel } from '@meith/theme-kit'

import { postLink } from './post-link'
import { untranslated } from './time'
import { filterWords } from './word-filter'

export interface PostFormInput {
  readonly forum: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
  readonly t?: Translator
}

export function buildNewThreadView(input: PostFormInput): Omit<PostFormModel, 'regions'> {
  const t = input.t ?? untranslated()

  return {
    mode: 'thread',
    heading: t.t('postForm.newThread', { forum: input.forum.title }),
    cancelHref: `/${input.forum.id}-${input.forum.slug}`,
    cancelLabel: t.t('postForm.backToForum', { forum: input.forum.title }),
    errorMessage: input.errorMessage ?? null,
  }
}

export interface ReplyViewInput {
  readonly thread: { readonly id: number; readonly title: string; readonly slug: string }
  readonly errorMessage?: string | null
  readonly t?: Translator
  readonly wordFilter?: CompiledWordFilter | undefined
}

export function buildReplyView(input: ReplyViewInput): Omit<PostFormModel, 'regions'> {
  const t = input.t ?? untranslated()

  return {
    mode: 'reply',
    heading: t.t('postForm.reply', { thread: filterWords(input.thread.title, input.wordFilter) }),
    cancelHref: `/thread/${input.thread.id}-${input.thread.slug}`,
    cancelLabel: t.t('postForm.backToThread'),
    errorMessage: input.errorMessage ?? null,
  }
}

export interface EditViewInput {
  readonly thread: { readonly id: number; readonly title: string; readonly slug: string }
  readonly postId: number
  readonly isDeleted: boolean
  readonly errorMessage?: string | null
  readonly t?: Translator
}

export function buildEditView(input: EditViewInput): Omit<PostFormModel, 'regions'> {
  const t = input.t ?? untranslated()

  return {
    mode: 'edit',
    heading: t.t(input.isDeleted ? 'postForm.deletedPost' : 'postForm.editPost'),
    cancelHref: postLink(`/thread/${input.thread.id}-${input.thread.slug}`, input.postId),
    cancelLabel: t.t('postForm.backToThread'),
    errorMessage: input.errorMessage ?? null,
  }
}
