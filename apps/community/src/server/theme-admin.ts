import 'server-only'

import { ForbiddenError } from '@meith/core'
import { PostgresThemeAdminRepository, getDb, type ThemeRecord } from '@meith/db'

import forumConfig from '../../community.config'
import { tokenMeta } from '@/view/theme-tokens'
import type { EditableToken } from '@/view/theme-draft'

import { getContainer } from './container'
import { validateTokenOverrides, type TokenOverrides } from './theme-style'

export function themeAdminRepository(): PostgresThemeAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresThemeAdminRepository(getDb())
    : null
}

export function requireThemeAdmin(): PostgresThemeAdminRepository {
  const repository = themeAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its theme cannot be edited.',
    )
  }
  return repository
}

export type TokenRow = EditableToken

export interface ThemeAdminView {
  readonly key: string
  readonly title: string
  readonly isBuildTheme: boolean
  readonly isDefault: boolean
  readonly enabled: boolean
  readonly tokens: readonly TokenRow[]
  readonly customCss: string
  readonly customised: boolean
  readonly updatedAt: Date | null
}

export interface ThemeListing {
  readonly key: string
  readonly title: string
  readonly isBuildTheme: boolean
  readonly isDefault: boolean
  readonly enabled: boolean
  readonly overriddenTokens: number
  readonly hasCustomCss: boolean
  readonly updatedAt: Date | null
}

const buildThemeKey = forumConfig.defaultTheme

function countOverrides(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 0

  const record = raw as Record<string, unknown>
  const scheme = (value: unknown): string[] =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>)
      : []

  const keys = Object.keys(record)
  if (keys.length > 0 && keys.every((key) => key === 'light' || key === 'dark')) {
    return new Set([...scheme(record.light), ...scheme(record.dark)]).size
  }
  return keys.length
}

export async function themeListing(): Promise<readonly ThemeListing[]> {
  const repository = themeAdminRepository()
  const rows = repository === null ? [] : await repository.list()
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const registered = Object.values(forumConfig.themes)
  const claimed = registered.find((theme) => byKey.get(theme.key)?.isDefault === true)

  return registered.map((theme) => {
    const row = byKey.get(theme.key)
    const enabled = row?.enabled !== false
    return {
      key: theme.key,
      title: theme.title,
      isBuildTheme: theme.key === buildThemeKey,
      isDefault:
        claimed === undefined || byKey.get(claimed.key)?.enabled === false
          ? theme.key === buildThemeKey
          : claimed.key === theme.key,
      enabled,
      overriddenTokens: countOverrides(row?.tokenOverrides),
      hasCustomCss: (row?.customCss ?? null) !== null,
      updatedAt: row?.updatedAt ?? null,
    }
  })
}

export async function buildThemeAdminView(key: string): Promise<ThemeAdminView | null> {
  const installed = forumConfig.themes[key]
  const repository = themeAdminRepository()
  if (installed === undefined || repository === null) return null

  const record: ThemeRecord | null = await repository.read(key)

  let overrides: TokenOverrides = { light: {}, dark: {} }
  try {
    overrides = validateTokenOverrides(installed.tokens, record?.tokenOverrides)
  } catch {
    /* ignore */
  }

  const listing = (await themeListing()).find((entry) => entry.key === key)

  return {
    key,
    title: installed.title,
    isBuildTheme: key === buildThemeKey,
    isDefault: listing?.isDefault ?? key === buildThemeKey,
    enabled: listing?.enabled ?? true,
    tokens: Object.keys(installed.tokens.light).map((name) => {
      const light = installed.tokens.light[name] ?? ''
      const dark = installed.tokens.dark[name] ?? ''
      const meta = tokenMeta(name)
      return {
        name,
        label: meta.label,
        hint: meta.hint,
        kind: meta.kind,
        light,
        dark,
        overrideLight: overrides.light[name] ?? '',
        overrideDark: overrides.dark[name] ?? '',
      }
    }),
    customCss: record?.customCss ?? '',
    customised: record !== null,
    updatedAt: record?.updatedAt ?? null,
  }
}

export function themeTokens(
  key: string,
): { light: Readonly<Record<string, string>>; dark: Readonly<Record<string, string>> } | null {
  const installed = forumConfig.themes[key]
  return installed === undefined
    ? null
    : { light: installed.tokens.light, dark: installed.tokens.dark }
}

export function themeTitle(key: string): string | null {
  return forumConfig.themes[key]?.title ?? null
}

export function isBuildTheme(key: string): boolean {
  return key === buildThemeKey
}

export interface SampleSurface {
  readonly background: string
  readonly foreground: string
}

export async function boardSampleSurfaces(): Promise<{
  readonly light: SampleSurface
  readonly dark: SampleSurface
}> {
  const listing = await themeListing().catch(() => [])
  const key = listing.find((entry) => entry.isDefault)?.key ?? buildThemeKey
  const theme = forumConfig.themes[key] ?? forumConfig.themes[buildThemeKey]

  const light = theme?.tokens.light ?? {}
  const dark = theme?.tokens.dark ?? {}

  let overrides: TokenOverrides = { light: {}, dark: {} }
  if (theme !== undefined) {
    const record = await themeAdminRepository()?.read(key).catch(() => null)
    try {
      overrides = validateTokenOverrides(theme.tokens, record?.tokenOverrides)
    } catch {
      /* ignore */
    }
  }

  const pick = (
    shipped: Readonly<Record<string, string>>,
    override: Readonly<Record<string, string>>,
    name: string,
  ): string => override[name] ?? shipped[name] ?? ''

  return {
    light: {
      background: pick(light, overrides.light, 'card'),
      foreground: pick(light, overrides.light, 'card-foreground'),
    },
    dark: {
      background: pick(dark, overrides.dark, 'card'),
      foreground: pick(dark, overrides.dark, 'card-foreground'),
    },
  }
}
