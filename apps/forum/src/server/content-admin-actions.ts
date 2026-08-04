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
import { compileSmilies, createTagRegistry } from '@meith/bbcode'
import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import type { SmileyRow } from '@meith/db'
import { drivers } from '@meith/drivers'

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

/* ------------------------------------------------------------------ *
 * The board's BBCode vocabulary
 * ------------------------------------------------------------------ */

/**
 * Every vocabulary write clears the same tag.
 *
 * The repository bumps `cache_versions['bbcode_vocabulary']` in the same call,
 * which is the *other* half of the same invalidation: this one drops the
 * compiled vocabulary the render path is holding, and that one marks every
 * stored render on the board stale. Doing one without the other leaves a board
 * that renders the new smilies from source and the old ones from cache, which
 * is the confusing half-applied state this pairing exists to avoid.
 */
async function invalidateVocabulary(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.bbcodeVocabulary()])
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
 * Validate a custom tag the way the parser will.
 *
 * `createTagRegistry` enforces both rules that matter and neither is restated
 * here: the name shape, and that an existing tag cannot be overridden — because
 * changing what `[url]` does must be a code review rather than an admin form.
 */
function assertTagCompiles(name: string, block: boolean): void {
  try {
    createTagRegistry([{ name, block }])
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'That tag name is not valid.')
  }
}

export async function createCustomTagAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    /*
     * Lower-cased before anything else looks at it. `[Spoiler]` and `[spoiler]`
     * are the same tag to the tokeniser, so storing both would be two rows the
     * registry refuses to build from — and the refusal would happen on the
     * render path rather than here.
     */
    const name = text(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertTagCompiles(name, block)

    const description = text(form, 'description')
    const tagId = await requireContentAdmin().createCustomTag({
      name,
      block,
      description: description === '' ? null : description,
    })

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.bbcode_added', detail: { tagId, name } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateCustomTagAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const tagId = id(form)
    const name = text(form, 'name').toLowerCase()
    const block = form.get('block') !== null
    assertTagCompiles(name, block)

    const description = text(form, 'description')
    await requireContentAdmin().updateCustomTag(tagId, {
      name,
      block,
      description: description === '' ? null : description,
      enabled: form.get('enabled') !== null,
    })

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.bbcode_changed', detail: { tagId, name } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Delete a custom tag.
 *
 * `[spoiler]x[/spoiler]` in a post whose tag has gone renders as that literal
 * text, because F36's parser demotes an unknown tag rather than dropping it.
 * The post shows the markup its author typed, which is the least surprising of
 * the available outcomes and is why this needs no "in use" check.
 */
export async function deleteCustomTagAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const tagId = id(form)
    await requireContentAdmin().deleteCustomTag(tagId)

    await invalidateVocabulary()
    await recordAdminAction({ action: 'content.bbcode_removed', detail: { tagId } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}
