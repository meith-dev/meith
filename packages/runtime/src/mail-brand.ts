import { env, logger } from '@meith/core'
import { type Database, PostgresSettingsRepository, PostgresThemeRepository } from '@meith/db'
import {
  buildMailBrand,
  type MailBrand,
  mergeTokenOverrides,
  type ThemeTokenSet,
} from '@meith/mail'
import { resolveBoardUrl, SettingsSnapshot } from '@meith/settings'
import { DARK_TOKENS, LIGHT_TOKENS } from '@meith/theme-default'

export const DEFAULT_THEME_KEY = 'default'

export type ThemeTokenRegistry = Readonly<Record<string, ThemeTokenSet>>

export const SHIPPED_TOKENS: ThemeTokenRegistry = {
  [DEFAULT_THEME_KEY]: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
}

export interface MailBrandDeps {
  readonly db: Database
  readonly themeKey?: string
  readonly themeTokens?: ThemeTokenRegistry
}

async function themeTokens(deps: MailBrandDeps): Promise<ThemeTokenSet | null> {
  const registry = deps.themeTokens ?? SHIPPED_TOKENS
  const buildKey = deps.themeKey ?? DEFAULT_THEME_KEY

  const rows = await new PostgresThemeRepository(deps.db).listRuntime()
  const claimed = rows.find(
    (row) => row.isDefault && row.enabled && registry[row.key] !== undefined,
  )

  const key = claimed?.key ?? buildKey
  const baseline = registry[key] ?? registry[DEFAULT_THEME_KEY] ?? SHIPPED_TOKENS[DEFAULT_THEME_KEY]
  if (baseline === undefined) return null

  const overrides = rows.find((row) => row.key === key)?.tokenOverrides ?? null

  return mergeTokenOverrides(baseline, overrides)
}

export async function resolveMailBrand(deps: MailBrandDeps): Promise<MailBrand> {
  let boardName = ''
  let fromName = ''
  let boardUrl = ''
  let logo: { lightKey: string; darkKey: string; alt: string } | undefined
  let tokens: ThemeTokenSet | null = null

  try {
    const overrides = await new PostgresSettingsRepository(deps.db).loadAll()
    const settings = SettingsSnapshot.fromOverrides(new Map(overrides))

    boardName = settings.get('board.name')
    fromName = settings.get('mail.from_name')
    boardUrl = resolveBoardUrl({ environment: env, settings }).url

    const alt = settings.get('board.logo_alt').trim()
    logo = {
      lightKey: settings.get('board.logo_light'),
      darkKey: settings.get('board.logo_dark'),
      alt: alt === '' ? boardName : alt,
    }
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read board name for mail')
  }

  try {
    tokens = await themeTokens(deps)
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read theme tokens for mail')
    tokens = SHIPPED_TOKENS[DEFAULT_THEME_KEY] ?? null
  }

  return buildMailBrand({
    boardName,
    fromName,
    boardUrl,
    tokens,
    ...(logo === undefined ? {} : { logo }),
  })
}
