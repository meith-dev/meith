'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, ValidationError } from '@meith/core'
import type {
  AnnouncementInput,
  PostgresAnnouncementRepository,
  PostgresCaptchaQuestionRepository,
  SmileyRow,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'
import { compileSmilies, createDirectiveRegistry } from '@meith/markdown'

import { recordAdminAction, requireAdmin } from './admin'
import { announcementRepository } from './announcements'
import { captchaQuestionRepository } from './antispam'
import type { FormState } from './auth-form-state'
import { requireAttachmentAdmin, requireContentAdmin } from './content-admin'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { emitEvent, viewerRef } from './plugin-view'

function id(form: FormData, name = 'id'): number {
  const value = Number(trimmedText(form, name))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError(msg('error.app.such-row'))
  return value
}

const toFormState = formStateReporter('content-admin', 'content administration write failed')

function refreshPanel(path: string): void {
  revalidatePath(path)
}

async function invalidateWordFilters(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.wordFilters()])
  refreshPanel('/admin/content')
}

export async function createWordFilterAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const filterId = await requireContentAdmin().createWordFilter({
      pattern: trimmedText(form, 'pattern'),
      replacement:
        typeof form.get('replacement') === 'string' ? (form.get('replacement') as string) : '',
      wholeWord: form.get('wholeWord') !== null,
    })

    await invalidateWordFilters()
    await recordAdminAction({ action: 'content.word_filter_added', detail: { filterId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateWordFilterAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const filterId = id(form)

    await requireContentAdmin().updateWordFilter(filterId, {
      pattern: trimmedText(form, 'pattern'),
      replacement:
        typeof form.get('replacement') === 'string' ? (form.get('replacement') as string) : '',
      wholeWord: form.get('wholeWord') !== null,
      enabled: form.get('enabled') !== null,
    })

    await invalidateWordFilters()
    await recordAdminAction({ action: 'content.word_filter_changed', detail: { filterId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteWordFilterAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const filterId = id(form)

    await requireContentAdmin().deleteWordFilter(filterId)

    await invalidateWordFilters()
    await recordAdminAction({ action: 'content.word_filter_removed', detail: { filterId } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function createPrefixAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const order = Number(trimmedText(form, 'displayOrder') || '0')
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError(msg('error.app.display-order-must-whole-number'))
    }

    const prefixId = await requireContentAdmin().createPrefix({
      label: trimmedText(form, 'label'),
      token: trimmedText(form, 'token') === '' ? null : trimmedText(form, 'token'),
      displayOrder: order,
      forumPathPrefix:
        trimmedText(form, 'forumPathPrefix') === '' ? null : trimmedText(form, 'forumPathPrefix'),
    })

    await drivers().cache.invalidateTags([CacheTags.prefixes()])
    refreshPanel('/admin/content')
    await recordAdminAction({ action: 'content.prefix_added', detail: { prefixId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deletePrefixAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const prefixId = id(form)

    await requireContentAdmin().deletePrefix(prefixId)

    await drivers().cache.invalidateTags([CacheTags.prefixes()])
    refreshPanel('/admin/content')
    await recordAdminAction({ action: 'content.prefix_removed', detail: { prefixId } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}

async function invalidateVocabulary(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.markdownVocabulary()])
  refreshPanel('/admin/content')
}

function assertSmileyCompiles(
  existing: readonly SmileyRow[],
  candidate: { code: string; src: string; alt: string | null },
  replacingId: number | null,
): void {
  const others = existing
    .filter((row) => row.id !== replacingId)
    .map((row) => ({ code: row.code, src: row.src, ...(row.alt === null ? {} : { alt: row.alt }) }))

  try {
    compileSmilies([
      ...others,
      {
        code: candidate.code,
        src: candidate.src,
        ...(candidate.alt === null ? {} : { alt: candidate.alt }),
      },
    ])
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'That smiley is not valid.')
  }
}

export async function createSmileyAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const repository = requireContentAdmin()
    const candidate = {
      code: trimmedText(form, 'code'),
      src: trimmedText(form, 'src'),
      alt: trimmedText(form, 'alt') === '' ? null : trimmedText(form, 'alt'),
    }
    assertSmileyCompiles(await repository.listSmilies(), candidate, null)

    const smileyId = await repository.createSmiley(candidate)

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.smiley_added', detail: { smileyId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateSmileyAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const repository = requireContentAdmin()
    const smileyId = id(form)
    const candidate = {
      code: trimmedText(form, 'code'),
      src: trimmedText(form, 'src'),
      alt: trimmedText(form, 'alt') === '' ? null : trimmedText(form, 'alt'),
    }
    assertSmileyCompiles(await repository.listSmilies(), candidate, smileyId)

    await repository.updateSmiley(smileyId, { ...candidate, enabled: form.get('enabled') !== null })

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.smiley_changed', detail: { smileyId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteSmileyAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const smileyId = id(form)
    await requireContentAdmin().deleteSmiley(smileyId)

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.smiley_removed', detail: { smileyId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

function assertDirectiveCompiles(name: string, block: boolean): void {
  try {
    createDirectiveRegistry([{ name, block }])
  } catch (err) {
    throw new ValidationError(
      err instanceof Error ? err.message : 'That directive name is not valid.',
    )
  }
}

export async function createDirectiveAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const name = trimmedText(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertDirectiveCompiles(name, block)

    const description = trimmedText(form, 'description')
    const tagId = await requireContentAdmin().createDirective({
      name,
      block,
      description: description === '' ? null : description,
    })

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.directive_added', detail: { tagId, name } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateDirectiveAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const tagId = id(form)
    const name = trimmedText(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertDirectiveCompiles(name, block)

    const description = trimmedText(form, 'description')
    await requireContentAdmin().updateDirective(tagId, {
      name,
      block,
      description: description === '' ? null : description,
      enabled: form.get('enabled') !== null,
    })

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.directive_changed', detail: { tagId, name } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteDirectiveAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const tagId = id(form)
    await requireContentAdmin().deleteDirective(tagId)

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.directive_removed', detail: { tagId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteAttachmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const attachmentId = id(form)
    const removed = await requireAttachmentAdmin().delete(attachmentId)
    if (!removed) return { notice: 'deleted' }

    await emitEvent('attachment.deleted', { attachmentId }, viewerRef(await getActor()))
    await recordAdminAction({ action: 'content.attachment_removed', detail: { attachmentId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

function requireAnnouncements(): PostgresAnnouncementRepository {
  const repository = announcementRepository()
  if (repository === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-13'))
  }
  return repository
}

function moment(form: FormData, name: string): Date | null {
  const value = trimmedText(form, name)
  if (value === '') return null

  const parsed = new Date(`${value}Z`)
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(msg('error.app.valid-date'))
  return parsed
}

function announcementInput(form: FormData): AnnouncementInput {
  const forumText = trimmedText(form, 'forumId')
  return {
    forumId: forumText === '' ? null : id(form, 'forumId'),
    title: trimmedText(form, 'title'),
    message: typeof form.get('message') === 'string' ? (form.get('message') as string) : '',
    startsAt: moment(form, 'startsAt') ?? new Date(),
    endsAt: moment(form, 'endsAt'),
    enabled: form.get('enabled') !== null,
  }
}

export async function createAnnouncementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const context = await requireAdmin()

    const announcementId = await requireAnnouncements().create({
      ...announcementInput(form),
      authorUserId: context.userId,
    })

    await recordAdminAction({ action: 'content.announcement_added', detail: { announcementId } })
    refreshPanel('/admin/content/announcements')

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateAnnouncementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const announcementId = id(form)
    await requireAnnouncements().update(announcementId, announcementInput(form))

    await recordAdminAction({ action: 'content.announcement_changed', detail: { announcementId } })
    refreshPanel('/admin/content/announcements')

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteAnnouncementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const announcementId = id(form)
    await requireAnnouncements().delete(announcementId)

    await recordAdminAction({ action: 'content.announcement_removed', detail: { announcementId } })
    refreshPanel('/admin/content/announcements')

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

function requireCaptcha(): PostgresCaptchaQuestionRepository {
  const repository = captchaQuestionRepository()
  if (repository === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-14'))
  }
  return repository
}

function answersField(form: FormData): string {
  const value = form.get('answers')
  return typeof value === 'string' ? value : ''
}

export async function createCaptchaQuestionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const questionId = await requireCaptcha().create({
      question: trimmedText(form, 'question'),
      answers: answersField(form),
    })

    await recordAdminAction({ action: 'content.captcha_added', detail: { questionId } })
    refreshPanel('/admin/antispam')

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateCaptchaQuestionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const questionId = id(form)
    await requireCaptcha().update(questionId, {
      question: trimmedText(form, 'question'),
      answers: answersField(form),
      enabled: form.get('enabled') !== null,
    })

    await recordAdminAction({ action: 'content.captcha_changed', detail: { questionId } })
    refreshPanel('/admin/antispam')

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteCaptchaQuestionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const questionId = id(form)
    await requireCaptcha().delete(questionId)

    await recordAdminAction({ action: 'content.captcha_removed', detail: { questionId } })
    refreshPanel('/admin/antispam')

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}
