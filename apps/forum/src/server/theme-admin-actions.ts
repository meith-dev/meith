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
import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import { parseThemeExport } from '@meith/db'

import { recordAdminAction, requireAdmin } from './admin'
import { isBuildTheme, requireThemeAdmin, themeListing, themeTitle, themeTokens } from './theme-admin'
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
 * Every `token.<scheme>.<name>` field that was filled in.
 *
 * Read from the form rather than from the theme's declared list, so that
 * **F26's validator is the only thing deciding what a valid token is**. Walking
 * the declared names instead would silently drop a field naming a token the
 * theme does not have — which is the one case where the editor and the renderer
 * would disagree about the same input, and disagreeing quietly is worse than
 * either answer.
 *
 * `both` is not a third scheme; it is how the editor submits a token that has
 * no light-and-dark distinction — corner radius, the spacing step, the
 * monospace stack. It is expanded here rather than stored as a third key,
 * because the render path has exactly two blocks to write and a stored `both`
 * would need a rule in every reader.
 *
 * A blank value is not an override. The editor shows every token the theme
 * declares, so most fields are empty on any real board, and storing those would
 * write `--primary:;` into the cascade: a token that overrides the theme with
 * nothing. That is also why the colour picker beside each field carries no
 * `name` — a native colour input always submits *something*, so letting it post
 * would turn "unchanged" into an override of every colour on the board.
 */
function submittedTokens(form: FormData): {
  light: Record<string, string>
  dark: Record<string, string>
} {
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}

  for (const [field, value] of form.entries()) {
    if (typeof value !== 'string') continue
    const match = /^token\.(light|dark|both)\.(.+)$/.exec(field)
    if (match === null) continue

    const trimmed = value.trim()
    if (trimmed === '') continue

    const [, scheme, name] = match as unknown as [string, string, string]
    if (scheme !== 'dark') light[name] = trimmed
    if (scheme !== 'light') dark[name] = trimmed
  }

  return { light, dark }
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

    /* F26's own validators — the ones the render path uses. */
    const validated = validateTokenOverrides(tokens, submittedTokens(form))
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
      detail: {
        key,
        tokens: new Set([...Object.keys(validated.light), ...Object.keys(validated.dark)]).size,
        customCss: css !== null,
      },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Validate the pending values and hand them back without saving.
 *
 * The editor previews live in the browser when it can — the sample is painted
 * from the form's own state as a colour is dragged, which is the only thing a
 * person choosing a colour actually wants. This is the **no-JavaScript** path
 * (D06): the form posts back, the action validates exactly as a save would, and
 * the page re-renders with real board chrome painted in the pending tokens. It
 * previews *what a save would do*, because it runs the same validator and the
 * same declaration rendering rather than approximating them.
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

    const submitted: Record<string, string> = {}
    for (const [field, value] of form.entries()) {
      if (field.startsWith('token.') && typeof value === 'string') submitted[field] = value
    }

    const validated = validateTokenOverrides(tokens, submittedTokens(form))
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
 * colour must still be able to see the form to change it back. The dark sample
 * is scoped one level further, to the element that carries `.dark`, so both
 * schemes can be shown side by side on one page.
 */
function declarationBlock(
  overrides: { light: Readonly<Record<string, string>>; dark: Readonly<Record<string, string>> },
  customCss: string | null,
): string {
  const declarations = (values: Readonly<Record<string, string>>): string =>
    Object.entries(values)
      .map(([name, value]) => `--${name}:${value};`)
      .join('')

  return (
    `[data-theme-preview]{${declarations(overrides.light)}}` +
    `[data-theme-preview].dark{${declarations(overrides.dark)}}` +
    (customCss ?? '')
  )
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
      detail: {
        key,
        tokens: new Set([...Object.keys(validated.light), ...Object.keys(validated.dark)]).size,
      },
    })

    return { notice: 'imported' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Turn a theme on or off for members.
 *
 * Two refusals, and both are about leaving the board in a state the screen
 * cannot get it out of:
 *
 *  - **the build's own theme may not be disabled.** Its components are what
 *    every page renders; disabling it would leave the board painting one
 *    theme's markup in another's palette, and the control that did it would
 *    then be offering no way back.
 *  - **the default may not be disabled.** Move the default first. Silently
 *    reassigning it here would be a second, unrequested change hidden inside
 *    the first.
 */
export async function setThemeEnabledAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)
    const enabled = text(form, 'enabled') === 'true'

    if (!enabled) {
      if (isBuildTheme(key)) {
        throw new ValidationError(
          'This is the theme the board is built with, so it always stays available. ' +
            'Change `defaultTheme` in forum.config.ts and redeploy to swap it.',
        )
      }
      const listing = (await themeListing()).find((entry) => entry.key === key)
      if (listing?.isDefault === true) {
        throw new ValidationError(
          'This is the default theme. Make another theme the default first, then turn this one off.',
        )
      }
    }

    await requireThemeAdmin().setEnabled(key, enabled, themeTitle(key) ?? key)

    await invalidateTheme(key)
    await recordAdminAction({ action: 'theme.enabled', detail: { key, enabled } })

    return { notice: enabled ? 'enabled' : 'disabled' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Choose the theme a member who has chosen nothing is shown.
 *
 * Enabling is implied and deliberate: a default nobody may pick is a board
 * whose members all see a theme that is not in their own switcher, which is a
 * state with no honest way to describe it on screen.
 */
export async function setDefaultThemeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    await requireThemeAdmin().setDefault(key, themeTitle(key) ?? key)

    await invalidateTheme(key)
    await recordAdminAction({ action: 'theme.default', detail: { key } })

    return { notice: 'default' }
  } catch (err) {
    return toFormState(err)
  }
}
