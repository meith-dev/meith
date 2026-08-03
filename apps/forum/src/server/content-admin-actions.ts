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
import { CacheTags, ValidationError, isAppError, logger } from '@forum/core'
import { drivers } from '@forum/drivers'

import { recordAdminAction, requireAdmin } from './admin'
import { requireContentAdmin } from './content-admin'
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
       * dot-path). Blank means every forum, which is what most boards want.
       */
      forumPathPrefix:
        text(form, 'forumPathPrefix') === '' ? null : text(form, 'forumPathPrefix'),
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
