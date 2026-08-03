'use server'

/**
 * F68 — the theme writes.
 *
 * **Validation is F26's, not a second copy.** `validateTokenOverrides` and
 * `validateCustomCss` are the functions the *render path* runs on every page,
 * and running the same ones before the write is what makes "saved" mean "will
 * render". A separate validator here would eventually disagree with the one
 * that paints, and the direction it would disagree in is the dangerous one: a
 * value accepted by the editor and rejected at render is a board that goes
 * blank on the next request, from an administrator's own save.
 *
 * That is also why a failed validation comes back as a form error rather than
 * an exception. F26 throws — it is a boundary check against a hand-edited row —
 * and the screen's job is to turn "token `primary` has an unsafe CSS value"
 * into something beside the field rather than into a 500.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@forum/core'
import { drivers } from '@forum/drivers'
import { parseThemeExport } from '@forum/db'

import { recordAdminAction, requireAdmin } from './admin'
import { requireThemeAdmin, themeTitle, themeTokens } from './theme-admin'
import { validateCustomCss, validateTokenOverrides } from './theme-style'
import type { FormState } from './auth-form-state'

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  /*
   * F26's validators throw plain `Error`s with messages written for an
   * operator — "Theme token \"primary\" has an unsafe CSS value." — so those are
   * shown rather than swallowed. Anything else is logged and generalised.
   */
  if (err instanceof Error && err.message.startsWith('Theme ')) {
    return { error: err.message }
  }
  logger({ module: 'theme-admin' }).error({ err }, 'theme write failed')
  return { error: 'Something went wrong. Please try again.' }
}

/**
 * Every `token.<name>` field that was filled in.
 *
 * Read from the form rather than from the theme's declared list, so that
 * **F26's validator is the only thing deciding what a valid token is**. Walking
 * the declared names instead would silently drop a field naming a token the
 * theme does not have — which is the one case where the editor and the renderer
 * would disagree about the same input, and disagreeing quietly is worse than
 * either answer.
 *
 * A blank value is not an override. The editor shows every token the theme
 * declares, so most fields are empty on any real board, and storing those would
 * write `--primary:;` into the cascade: a token that overrides the theme with
 * nothing.
 */
function submittedTokens(form: FormData): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const [field, value] of form.entries()) {
    if (!field.startsWith('token.') || typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed !== '') overrides[field.slice('token.'.length)] = trimmed
  }
  return overrides
}

/** A theme key that names an installed theme, or a refusal. */
function themeKey(form: FormData): string {
  const key = text(form, 'key')
  if (themeTitle(key) === null) throw new ValidationError('No such theme.')
  return key
}

async function invalidateTheme(key: string): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.theme(key)])
}

/**
 * Save the token overrides and the custom CSS.
 *
 * **A blank field is "use the theme's value", not an empty override.** The
 * editor shows every token the theme declares with its compiled value beside
 * it, so most fields are blank on any real board — storing those as empty
 * strings would write `--primary:;` into the cascade and produce a token that
 * overrides the theme with nothing.
 */
export async function saveThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    const tokens = themeTokens(key)
    if (tokens === null) throw new ValidationError('No such theme.')

    const overrides = submittedTokens(form)

    /* F26's own validators — the ones the render path uses. */
    const validated = validateTokenOverrides(tokens, overrides)
    const css = validateCustomCss(text(form, 'customCss') === '' ? null : text(form, 'customCss'))

    await requireThemeAdmin().save({
      key,
      title: themeTitle(key) ?? key,
      tokenOverrides: validated,
      customCss: css,
    })

    await invalidateTheme(key)
    await recordAdminAction({
      action: 'theme.saved',
      /* Which tokens changed, never their values — the same rule as F64. */
      detail: { key, tokens: Object.keys(validated).length, customCss: css !== null },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Validate the pending values and hand them back without saving.
 *
 * The preview is a **post-back**, not an island: the form submits, the action
 * validates exactly as a save would, and the page re-renders with a sample of
 * real board chrome painted in the pending tokens. It therefore works with no
 * JavaScript at all (D06), and — more importantly — it previews *what a save
 * would do*, because it runs the same validator and the same declaration
 * rendering rather than approximating them in the browser.
 *
 * The values come back in `values` so the form keeps what was typed. A preview
 * that cleared the form would be worse than none.
 */
export async function previewThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    const tokens = themeTokens(key)
    if (tokens === null) throw new ValidationError('No such theme.')

    const overrides = submittedTokens(form)
    const submitted = Object.fromEntries(
      Object.entries(overrides).map(([name, value]) => [`token.${name}`, value]),
    )
    const validated = validateTokenOverrides(tokens, overrides)
    const css = validateCustomCss(text(form, 'customCss') === '' ? null : text(form, 'customCss'))

    return {
      notice: 'previewed',
      values: { ...submitted, customCss: text(form, 'customCss') },
      /*
       * `preview` is the field this codebase already reserves for trusted,
       * self-generated markup (F36/F41) — everything in `values` is echoed into
       * a form control as text, and this is inserted as a style block instead,
       * so it must not be reachable by the same name.
       */
      preview: declarationBlock(validated, css),
    }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * The scoped style block a preview paints with.
 *
 * Scoped to `[data-theme-preview]` rather than `:root`, so previewing cannot
 * restyle the control panel around it — an operator previewing an unreadable
 * colour must still be able to see the form to change it back.
 */
function declarationBlock(
  overrides: Readonly<Record<string, string>>,
  customCss: string | null,
): string {
  const declarations = Object.entries(overrides)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')

  return `[data-theme-preview]{${declarations}}${customCss ?? ''}`
}

/**
 * Put the theme back to what it ships with.
 *
 * Not re-authenticated, deliberately, and it is worth saying why when so much
 * else in this panel is: reset is the *undo*. Everything it can destroy is
 * recoverable by pasting back an export, and putting a password prompt in front
 * of the recovery path is how somebody stares at a broken board they cannot
 * fix. The destructive direction here is `save`, and that one an operator can
 * always undo by resetting.
 */
export async function resetThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    await requireThemeAdmin().reset(key)

    await invalidateTheme(key)
    await recordAdminAction({ action: 'theme.reset', detail: { key } })

    return { notice: 'reset' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Apply an exported theme document.
 *
 * Validated twice over, and both are needed: `parseThemeExport` checks the
 * *envelope* — that this is a document of a version this build understands —
 * and F26's validators check the *values*, because a file that arrived by email
 * is exactly as untrusted as a hand-edited row.
 *
 * The key in the document is ignored in favour of the one being edited, so
 * copying a look between boards works. That is the case import exists for.
 */
export async function importThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    const tokens = themeTokens(key)
    if (tokens === null) throw new ValidationError('No such theme.')

    const document = parseThemeExport(text(form, 'document'))
    const validated = validateTokenOverrides(tokens, document.tokenOverrides)
    const css = validateCustomCss(document.customCss)

    await requireThemeAdmin().save({
      key,
      title: themeTitle(key) ?? key,
      tokenOverrides: validated,
      customCss: css,
    })

    await invalidateTheme(key)
    await recordAdminAction({
      action: 'theme.imported',
      detail: { key, tokens: Object.keys(validated).length },
    })

    return { notice: 'imported' }
  } catch (err) {
    return toFormState(err)
  }
}
