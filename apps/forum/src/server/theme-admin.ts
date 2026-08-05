import 'server-only'

/**
 * F68 at the app layer.
 *
 * ## Where the build/runtime line actually falls
 *
 * **Installing** a theme is a build-time fact. `forum.config.ts` is the
 * registry (invariant 6): a serverless bundle contains only what the bundler
 * saw, and nothing is discovered by scanning a directory at request time. So
 * adding a theme is still `pnpm add`, a line in that file, redeploy — the same
 * honest story F69 tells about plugins.
 *
 * **Choosing** one is not. Every registered theme is in the bundle and resolved
 * at module load, so picking between them is a per-request choice like any
 * other, and `currentTheme()` makes it from a cookie. What this screen decides
 * — which themes are offered, which is the default, and what each one's colours
 * are — is all read on the render path.
 *
 * The screen used to say there could be no switcher at all, on the argument
 * that one "would cost every first paint a database read". That argument had
 * quietly expired: 91 of the board's 92 routes were already dynamic, because
 * the shell resolves the viewer.
 */
import { ForbiddenError } from '@meith/core'
import { PostgresThemeAdminRepository, getDb, type ThemeRecord } from '@meith/db'

import forumConfig from '../../forum.config'
import { tokenMeta, type TokenKind } from '@/view/theme-tokens'

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

/** One editable token: what the theme ships, and what this board overrides. */
export interface TokenRow {
  readonly name: string
  readonly label: string
  readonly hint: string
  readonly kind: TokenKind
  /** The compiled value, light and dark, straight from the theme package. */
  readonly light: string
  readonly dark: string
  /** This board's override per scheme, or `''` for "use the theme's". */
  readonly overrideLight: string
  readonly overrideDark: string
}

export interface ThemeAdminView {
  readonly key: string
  readonly title: string
  /** True for the theme whose *components* this build renders. */
  readonly isBuildTheme: boolean
  /** True for the theme a member who has chosen nothing is shown. */
  readonly isDefault: boolean
  readonly enabled: boolean
  readonly tokens: readonly TokenRow[]
  readonly customCss: string
  readonly customised: boolean
  readonly updatedAt: Date | null
}

/** A theme as the management list shows it. */
export interface ThemeListing {
  readonly key: string
  readonly title: string
  /** Its components are what the board renders. Cannot be disabled. */
  readonly isBuildTheme: boolean
  readonly isDefault: boolean
  readonly enabled: boolean
  readonly overriddenTokens: number
  readonly hasCustomCss: boolean
  readonly updatedAt: Date | null
}

const buildThemeKey = forumConfig.defaultTheme

/**
 * How many tokens this board has overridden, counted across both schemes.
 *
 * Tolerant on purpose. This runs on the *listing*, where the only consequence
 * of a malformed row is a wrong number beside a theme name — and the screen
 * that fixes a malformed row is the one behind this link. Throwing here would
 * mean a hand-edited row locked an administrator out of the editor that repairs
 * it.
 */
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

/**
 * Every theme the build has, with whatever the board has decided about it.
 *
 * The registry is the list; storage is the exception to it — the same rule
 * F64's settings screen and F66's permission editor follow. A theme with no row
 * is enabled and uncustomised, which is what a freshly installed theme is.
 */
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
      /*
       * With no row claiming it, the default is the build's own theme — which
       * is what the board rendered before any of this was configurable, and
       * what `theme-runtime.ts` falls back to. Reading it the same way in both
       * places is what stops the screen and the page disagreeing.
       */
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

/**
 * Assemble the editor.
 *
 * The token list comes from the **theme package**, not from the stored row: the
 * row holds overrides only, and a screen built from it would show an operator
 * the three tokens they have already changed and none of the thirty-five they
 * could.
 *
 * A malformed stored row is read as "no overrides" rather than thrown from:
 * this is the screen an operator opens to *repair* such a row, and the editor
 * refusing to open is how they end up back in psql.
 */
export async function buildThemeAdminView(key: string): Promise<ThemeAdminView | null> {
  const installed = forumConfig.themes[key]
  const repository = themeAdminRepository()
  if (installed === undefined || repository === null) return null

  const record: ThemeRecord | null = await repository.read(key)

  let overrides: TokenOverrides = { light: {}, dark: {} }
  try {
    overrides = validateTokenOverrides(installed.tokens, record?.tokenOverrides)
  } catch {
    /* Shown as uncustomised; saving from this screen replaces the bad row. */
  }

  /*
   * "Is this the default?" cannot be answered from this theme's own row alone:
   * with no row claiming the default, it is the build's theme, and that is a
   * fact about every *other* row. One extra read on an administration screen,
   * resolved by the same function the listing uses so the two cannot disagree.
   */
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

/** The declared tokens for a key, for the actions' validation. */
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

/**
 * The theme whose components render, which is the one that may not be disabled.
 *
 * Turning it off would leave a board painting one theme's markup in another's
 * colours with no route back through the screen that did it.
 */
export function isBuildTheme(key: string): boolean {
  return key === buildThemeKey
}
