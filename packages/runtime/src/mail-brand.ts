import { env, logger } from '@meith/core'
import { PostgresSettingsRepository, PostgresThemeRepository, type Database } from '@meith/db'
import type { MailBrand } from '@meith/notifications'
import { SettingsSnapshot, resolveBoardUrl } from '@meith/settings'

export const DEFAULT_THEME_KEY = 'default'

const FALLBACK_ACCENT = '#3b5998'

const ACCENT_KEYS = ['primary', 'accent', 'brand'] as const

function readAccent(overrides: unknown): string | null {
  if (overrides === null || typeof overrides !== 'object') return null
  const record = overrides as Record<string, unknown>

  for (const key of ACCENT_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    const light = record['light']
    if (light !== null && typeof light === 'object') {
      const nested = (light as Record<string, unknown>)[key]
      if (typeof nested === 'string' && nested.trim() !== '') return nested.trim()
    }
  }
  return null
}

export async function resolveMailBrand(deps: {
  readonly db: Database
  readonly themeKey?: string
}): Promise<MailBrand> {
  const themeKey = deps.themeKey ?? DEFAULT_THEME_KEY

  let boardName = ''
  let fromName = ''
  let boardUrl = ''
  let accent: string | null = null

  try {
    const overrides = await new PostgresSettingsRepository(deps.db).loadAll()
    const settings = SettingsSnapshot.fromOverrides(new Map(overrides))
    boardName = settings.get('board.name')
    fromName = settings.get('mail.from_name')
    boardUrl = resolveBoardUrl({ environment: env, settings }).url
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read board name for mail')
  }

  try {
    const theme = await new PostgresThemeRepository(deps.db).findRuntimeByKey(themeKey)
    accent = readAccent(theme?.tokenOverrides ?? null)
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read theme tokens for mail')
  }

  return {
    boardName,
    fromName,
    boardUrl,
    accent: accent ?? FALLBACK_ACCENT,
  }
}

export async function resolveSenderName(db: Database): Promise<string> {
  try {
    const overrides = await new PostgresSettingsRepository(db).loadAll()
    return SettingsSnapshot.fromOverrides(new Map(overrides)).get('mail.from_name')
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read the sender name for mail')
    return ''
  }
}
