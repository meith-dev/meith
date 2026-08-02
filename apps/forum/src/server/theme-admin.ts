import 'server-only'

/**
 * F68 at the app layer.
 *
 * The one thing worth reading here is what this feature **cannot** do, because
 * it is a constraint the architecture chose on purpose rather than a gap.
 *
 * **Which theme a board runs is a build-time fact.** `forum.config.ts` is the
 * registry (invariant 6): a serverless bundle contains only what the bundler
 * saw, nothing is discovered by scanning a directory at request time, and
 * `activeTheme` is resolved once at module load because the `extends` chain
 * cannot change at runtime. So a runtime "switch theme" control would either be
 * a lie or would undo the reason the board renders without a database round-trip on
 * first paint. Installing or switching a theme is: `pnpm add`, a line in
 * `forum.config.ts`, redeploy — the same honest story F69 tells about plugins,
 * and the screen says it in those words.
 *
 * What *is* runtime is everything the render path reads per request: the token
 * overrides and the custom CSS, both of which `theme-runtime.ts` pulls from the
 * `themes` row on every page. That is the editor.
 */
import { ForbiddenError } from '@forum/core'
import { PostgresThemeAdminRepository, getDb, type ThemeRecord } from '@forum/db'

import forumConfig from '../../forum.config'
import { getContainer } from './container'

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
  /** The compiled value, light and dark, straight from the theme package. */
  readonly light: string
  readonly dark: string
  /** This board's override, or `''` for "use the theme's". */
  readonly override: string
}

export interface ThemeAdminView {
  readonly key: string
  readonly title: string
  /** True for the theme this build actually renders. */
  readonly isActive: boolean
  readonly tokens: readonly TokenRow[]
  readonly customCss: string
  readonly customised: boolean
  readonly updatedAt: Date | null
}

/** Every theme the build has, whether or not it has ever been customised. */
export function installedThemes(): readonly { key: string; title: string; active: boolean }[] {
  return Object.values(forumConfig.themes).map((theme) => ({
    key: theme.key,
    title: theme.title,
    active: theme.key === forumConfig.defaultTheme,
  }))
}

/**
 * Assemble the editor.
 *
 * The token list comes from the **theme package**, not from the stored row: the
 * row holds overrides only, and a screen built from it would show an operator
 * the three tokens they have already changed and none of the thirty-five they
 * could. The same rule F64's settings screen and F66's permission editor
 * follow — the registry is the list, storage is the exception to it.
 */
export async function buildThemeAdminView(key: string): Promise<ThemeAdminView | null> {
  const installed = forumConfig.themes[key]
  const repository = themeAdminRepository()
  if (installed === undefined || repository === null) return null

  const record: ThemeRecord | null = await repository.read(key)
  const overrides = record?.tokenOverrides ?? {}

  return {
    key,
    title: installed.title,
    isActive: key === forumConfig.defaultTheme,
    tokens: Object.keys(installed.tokens.light).map((name) => ({
      name,
      light: installed.tokens.light[name] ?? '',
      dark: installed.tokens.dark[name] ?? '',
      override: overrides[name] ?? '',
    })),
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
