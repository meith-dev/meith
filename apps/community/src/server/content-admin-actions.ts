'use server'

/**
 * F71 — the content administration writes.
 *
 * Every one of them clears the tag its data is read under, and for the word
 * filters that matters more than usual: the set is read on the **render path**,
 * so a stale one is visible on every thread page on the board until it is
 * cleared. An operator who adds a filter and sees the word still there would
 * reasonably conclude the feature does not work.
 */
import { compileSmilies, createDirectiveRegistry } from '@meith/markdown'
import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import type {
  AnnouncementInput,
  PostgresAnnouncementRepository,
  PostgresCaptchaQuestionRepository,
  SmileyRow,
} from '@meith/db'
import { drivers } from '@meith/drivers'

import { recordAdminAction, requireAdmin } from './admin'
import { announcementRepository } from './announcements'
import { captchaQuestionRepository } from './antispam'
import { requireAttachmentAdmin, requireContentAdmin } from './content-admin'
import type { FormState } from './auth-form-state'

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function id(form: FormData, name = 'id'): number {
  const value = Number(text(form, name))
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError('No such row.')
  return value
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'content-admin' }).error({ err }, 'content administration write failed')
  return { error: 'Something went wrong. Please try again.' }
}

async function invalidateWordFilters(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.wordFilters()])
}

export async function createWordFilterAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const filterId = await requireContentAdmin().createWordFilter({
      pattern: text(form, 'pattern'),
      /* Untrimmed: a replacement of "  " is a legitimate way to blank a word. */
      replacement: typeof form.get('replacement') === 'string'
        ? (form.get('replacement') as string)
        : '',
      wholeWord: form.get('wholeWord') !== null,
    })

    await invalidateWordFilters()
    await recordAdminAction({ action: 'content.word_filter_added', detail: { filterId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateWordFilterAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const filterId = id(form)

    await requireContentAdmin().updateWordFilter(filterId, {
      pattern: text(form, 'pattern'),
      replacement: typeof form.get('replacement') === 'string'
        ? (form.get('replacement') as string)
        : '',
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

/**
 * Delete a filter.
 *
 * Not re-authenticated, and safe: because filtering happens at render, deleting
 * a rule restores the word everywhere on the next page load. There is nothing
 * here to lose — which is exactly the property applying at render buys.
 */
export async function deleteWordFilterAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
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

export async function createPrefixAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const order = Number(text(form, 'displayOrder') || '0')
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError('Display order must be a whole number.')
    }

    const prefixId = await requireContentAdmin().createPrefix({
      label: text(form, 'label'),
      token: text(form, 'token') === '' ? null : text(form, 'token'),
      displayOrder: order,
      /*
       * A path prefix scopes the prefix to one branch of the tree (F16's
       * dot-path). Blank means every community, which is what most boards want.
       */
      communityPathPrefix:
        text(form, 'communityPathPrefix') === '' ? null : text(form, 'communityPathPrefix'),
    })

    await drivers().cache.invalidateTags([CacheTags.prefixes()])
    await recordAdminAction({ action: 'content.prefix_added', detail: { prefixId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Delete a prefix.
 *
 * `threads.prefix_id` is nullable with `on delete set null`, so the threads
 * carrying it lose the prefix and nothing else. Refusing to delete one that is
 * in use would make a mistyped prefix permanent.
 */
export async function deletePrefixAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const prefixId = id(form)

    await requireContentAdmin().deletePrefix(prefixId)

    await drivers().cache.invalidateTags([CacheTags.prefixes()])
    await recordAdminAction({ action: 'content.prefix_removed', detail: { prefixId } })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}

/* ------------------------------------------------------------------ *
 * The board's markup vocabulary
 * ------------------------------------------------------------------ */

/**
 * Every vocabulary write clears the same tag.
 *
 * The repository bumps `cache_versions['markdown_vocabulary']` in the same call,
 * which is the *other* half of the same invalidation: this one drops the
 * compiled vocabulary the render path is holding, and that one marks every
 * stored render on the board stale. Doing one without the other leaves a board
 * that renders the new smilies from source and the old ones from cache, which
 * is the confusing half-applied state this pairing exists to avoid.
 */
async function invalidateVocabulary(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.markdownVocabulary()])
}

/**
 * Validate a smiley the way the renderer will.
 *
 * `compileSmilies` is the function that runs on the render path, and calling it
 * here is the same rule F68's theme editor follows: a second validator drifts,
 * and the direction it drifts is a board whose thread pages throw because an
 * admin form accepted something the renderer refuses. The candidate is compiled
 * *with the existing set* so a duplicate code is caught here rather than by a
 * unique-index violation the operator cannot read.
 */
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
      { code: candidate.code, src: candidate.src, ...(candidate.alt === null ? {} : { alt: candidate.alt }) },
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
      /* Not trimmed to nothing: `compileSmilies` refuses whitespace outright. */
      code: text(form, 'code'),
      src: text(form, 'src'),
      alt: text(form, 'alt') === '' ? null : text(form, 'alt'),
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
      code: text(form, 'code'),
      src: text(form, 'src'),
      alt: text(form, 'alt') === '' ? null : text(form, 'alt'),
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

/**
 * Delete a smiley.
 *
 * Not re-authenticated, and safe for the same reason a word filter's delete is:
 * the code the author typed is still in `posts.message`, so the only effect is
 * that `:)` goes back to being two characters everywhere on the next render.
 * Nothing a member wrote is lost, so there is nothing to protect.
 */
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

/**
 * Validate a directive the way the parser will.
 *
 * `createDirectiveRegistry` is the function the render path runs, and calling
 * it here is the rule F68's theme editor follows: a second validator drifts,
 * and the direction it drifts is a board whose thread pages throw because an
 * admin form accepted something the parser refuses.
 */
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

    /*
     * Lower-cased before anything else looks at it. `:::Spoiler` and
     * `:::spoiler` are the same directive to the parser, so storing both would
     * be two rows the registry refuses to build from — and the refusal would
     * happen on the render path rather than here.
     */
    const name = text(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertDirectiveCompiles(name, block)

    const description = text(form, 'description')
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
    const name = text(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertDirectiveCompiles(name, block)

    const description = text(form, 'description')
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

/**
 * Delete a directive.
 *
 * `:spoiler[x]` in a post whose directive has gone renders as that literal
 * text, because F36's parser only opens a directive it has been told about. The
 * post shows the markup its author typed, which is the least surprising of the
 * available outcomes and is why this needs no "in use" check.
 */
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

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

/**
 * Delete one attachment.
 *
 * **Not re-authenticated, and this is the borderline case on this screen.** The
 * argument for the prompt is that these are bytes a member uploaded and cannot
 * put back; the argument against is that the reason an operator is here is
 * usually that something is wrong — a file over quota, a malicious upload, a
 * queue full of failures — and a password prompt in front of a clean-up done
 * dozens of times in a row is a prompt people learn to type through.
 *
 * It stays unprompted because the blast radius is one row: there is no "delete
 * all", no filter-wide action and no cascade. F65's copy-to-subcommunities and F67's
 * merges are re-authenticated because one press changes many things at once,
 * which is the distinction rather than "is it destructive".
 *
 * The post is untouched either way — see `attachment-admin-repo.ts`.
 */
export async function deleteAttachmentAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const attachmentId = id(form)
    const removed = await requireAttachmentAdmin().delete(attachmentId)
    if (!removed) return { notice: 'deleted' }

    await recordAdminAction({ action: 'content.attachment_removed', detail: { attachmentId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

function requireAnnouncements(): PostgresAnnouncementRepository {
  const repository = announcementRepository()
  if (repository === null) {
    throw new ValidationError(
      'This board is running on in-memory sample data, so it stores no announcements.',
    )
  }
  return repository
}

/**
 * Read a `datetime-local` field.
 *
 * The control submits wall-clock text with no zone (`2026-08-04T09:00`), so it
 * is read as UTC rather than as the server's local time — which is the one
 * choice that gives the same answer on a laptop and on a container whose `TZ`
 * nobody set. The screen says so beside the field, because an announcement that
 * appears at the wrong hour with no explanation is worse than one that asks for
 * UTC.
 */
function moment(form: FormData, name: string): Date | null {
  const value = text(form, name)
  if (value === '') return null

  const parsed = new Date(`${value}Z`)
  if (Number.isNaN(parsed.getTime())) throw new ValidationError('That is not a valid date.')
  return parsed
}

function announcementInput(form: FormData): AnnouncementInput {
  const communityText = text(form, 'communityId')
  return {
    /* Empty is board-wide. One column says it; see the migration. */
    communityId: communityText === '' ? null : id(form, 'communityId'),
    title: text(form, 'title'),
    /* Untrimmed body: leading whitespace can be deliberate in Markdown. */
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
      /*
       * The name is captured by the insert, from `users` — see the repository.
       * The action supplies the id it is certain of and nothing else.
       */
      authorUserId: context.userId,
    })

    await recordAdminAction({ action: 'content.announcement_added', detail: { announcementId } })

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
    /* The author is deliberately not rewritten; see the repository. */
    await requireAnnouncements().update(announcementId, announcementInput(form))

    await recordAdminAction({ action: 'content.announcement_changed', detail: { announcementId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Delete an announcement.
 *
 * A real delete and not re-authenticated, which is only defensible because of
 * what an announcement *is*: chrome rather than content. Nothing a member wrote
 * hangs off it, so there is nothing to lose — which is exactly the argument
 * that would fail for a sticky thread, and is why this board has both.
 */
export async function deleteAnnouncementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const announcementId = id(form)
    await requireAnnouncements().delete(announcementId)

    await recordAdminAction({ action: 'content.announcement_removed', detail: { announcementId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

/* ------------------------------------------------------------------ *
 * F46 — captcha questions
 * ------------------------------------------------------------------ */

function requireCaptcha(): PostgresCaptchaQuestionRepository {
  const repository = captchaQuestionRepository()
  if (repository === null) {
    throw new ValidationError(
      'This board is running on in-memory sample data, so it stores no questions.',
    )
  }
  return repository
}

/**
 * The answers box, kept untrimmed line by line.
 *
 * Read straight off the form rather than through `text()`, because the whole
 * value is meaningful: one answer per line, and trimming the block would still
 * leave the individual lines to the repository, which is where they are split.
 */
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
      question: text(form, 'question'),
      answers: answersField(form),
    })

    await recordAdminAction({ action: 'content.captcha_added', detail: { questionId } })

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
      question: text(form, 'question'),
      answers: answersField(form),
      enabled: form.get('enabled') !== null,
    })

    await recordAdminAction({ action: 'content.captcha_changed', detail: { questionId } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Delete a question.
 *
 * Safe, and the reason is the fail-open rule in `QuestionCaptcha`: deleting the
 * last question does not lock registration, it turns the challenge off. A
 * visitor holding a token for the deleted question is let through rather than
 * refused, because they loaded the page before the operator changed it.
 */
export async function deleteCaptchaQuestionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const questionId = id(form)
    await requireCaptcha().delete(questionId)

    await recordAdminAction({ action: 'content.captcha_removed', detail: { questionId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}
