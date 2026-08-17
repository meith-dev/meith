'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, isAppError, ValidationError } from '@meith/core'
import { parseThemeExport } from '@meith/db'
import { drivers } from '@meith/drivers'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import {
  isBuildTheme,
  requireThemeAdmin,
  themeListing,
  themeTitle,
  themeTokens,
} from './theme-admin'
import { validateCustomCss, validateTokenOverrides } from './theme-style'

const reportFailure = formStateReporter('theme-admin', 'theme write failed')

function toFormState(err: unknown): FormState {
  if (!isAppError(err) && err instanceof Error && err.message.startsWith('Theme ')) {
    return { error: err.message }
  }
  return reportFailure(err)
}

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

function themeKey(form: FormData): string {
  const key = trimmedText(form, 'key')
  if (themeTitle(key) === null) throw new ValidationError('No such theme.')
  return key
}

async function invalidateTheme(key: string): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.theme(key)])
  revalidatePath('/admin/themes')
  revalidatePath('/admin/themes/[key]', 'page')
}

export async function saveThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)

    const tokens = themeTokens(key)
    if (tokens === null) throw new ValidationError('No such theme.')

    const validated = validateTokenOverrides(tokens, submittedTokens(form))
    const customCss = trimmedText(form, 'customCss')
    const css = validateCustomCss(customCss === '' ? null : customCss)

    await requireThemeAdmin().save({
      key,
      title: themeTitle(key) ?? key,
      tokenOverrides: validated,
      customCss: css,
    })

    await invalidateTheme(key)
    await recordAdminAction({
      action: 'theme.saved',
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
    const customCss = trimmedText(form, 'customCss')
    const css = validateCustomCss(customCss === '' ? null : customCss)

    return {
      notice: 'previewed',
      values: { ...submitted, customCss },
      preview: declarationBlock(validated, css),
    }
  } catch (err) {
    return toFormState(err)
  }
}

export async function themeEditorAction(prev: FormState, form: FormData): Promise<FormState> {
  return trimmedText(form, 'intent') === 'preview'
    ? previewThemeAction(prev, form)
    : saveThemeAction(prev, form)
}

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
    (customCss === null ? '' : `[data-theme-preview]{${customCss}}`)
  )
}

export async function resetThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const key = themeKey(form)

    await requireThemeAdmin().reset(key)

    await invalidateTheme(key)
    await recordAdminAction({ action: 'theme.reset', detail: { key } })

    return { notice: 'reset' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function importThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const key = themeKey(form)

    const tokens = themeTokens(key)
    if (tokens === null) throw new ValidationError('No such theme.')

    const document = parseThemeExport(trimmedText(form, 'document'))
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

export async function setThemeEnabledAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const key = themeKey(form)
    const enabled = trimmedText(form, 'enabled') === 'true'

    if (!enabled) {
      if (isBuildTheme(key)) {
        throw new ValidationError(
          'This is the theme the board is built with, so it always stays available. ' +
            'Change `defaultTheme` in community.config.ts and redeploy to swap it.',
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

export async function setDefaultThemeAction(_prev: FormState, form: FormData): Promise<FormState> {
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
