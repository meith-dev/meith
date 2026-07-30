/**
 * The build-time registry (invariant 6).
 *
 * "Everything installable is registered in `forum.config.ts`. Nothing is
 * discovered by filesystem scan at runtime."
 *
 * The scan ban is the substance. A runtime `readdir` over a themes or plugins
 * directory breaks the product in three ways at once:
 *
 *  - it cannot work on the primary target, because a serverless bundle contains
 *    only what the bundler could see statically — a directory walked at request
 *    time is empty or missing;
 *  - it makes the installed set unknowable at build time, so nothing can be
 *    type-checked against it and a broken plugin surfaces as a 500 rather than
 *    a compile error;
 *  - it turns "what is installed" into a property of the filesystem, which
 *    differs between a developer's machine, CI, and production.
 *
 * So the config is a *module*, imported statically. `defineForumConfig` is an
 * identity function whose only job is to attach the type — the same shape as
 * `defineConfig` in tooling everywhere, and for the same reason: it gives
 * editors and `tsc` something to check without a schema at runtime.
 *
 * Deliberately minimal. The theme entry widens at F25 when `theme-kit` defines
 * the slot contract, and `plugins` gains a real element type at F79. Both are
 * additive: a registry that exists and is thin can grow, whereas a registry
 * retrofitted over finished pages cannot — which is the whole argument for
 * landing this before the first themed page.
 */

/** What the registry knows about a theme today. F25 widens this. */
export interface InstalledTheme {
  /** Stable key. Used in URLs, settings and `themes.token_overrides`. */
  readonly key: string
  readonly title: string
  /**
   * CSS custom properties, light and dark. Values are token *names* resolved by
   * the theme package; the registry does not interpret them.
   */
  readonly tokens: {
    readonly light: Readonly<Record<string, string>>
    readonly dark: Readonly<Record<string, string>>
  }
  /** `<meta name="theme-color">`, light and dark. */
  readonly browserThemeColor?: { readonly light: string; readonly dark: string } | undefined
}

/**
 * A registered plugin. An opaque placeholder until F79 defines the lifecycle —
 * present now so the config's shape does not change when plugins arrive.
 */
export interface InstalledPlugin {
  readonly key: string
  readonly enabled?: boolean | undefined
}

export interface ForumConfig {
  /** Every installed theme, keyed by its `key`. */
  readonly themes: Readonly<Record<string, InstalledTheme>>
  /** Which theme a board uses when it has no preference stored. */
  readonly defaultTheme: string
  readonly plugins?: readonly InstalledPlugin[] | undefined
}

/**
 * Validate what can be validated at module load, and return the config typed.
 *
 * The checks are the two that would otherwise fail far from their cause: a
 * `defaultTheme` naming a theme that is not installed (a blank board, no error),
 * and a theme registered under a key that disagrees with its own — which makes
 * `themes[key].key !== key` and breaks every lookup that round-trips through
 * one or the other.
 */
export function defineForumConfig(config: ForumConfig): ForumConfig {
  const keys = Object.keys(config.themes)

  if (keys.length === 0) {
    throw new Error('forum.config: at least one theme must be registered.')
  }

  for (const [key, theme] of Object.entries(config.themes)) {
    if (theme.key !== key) {
      throw new Error(
        `forum.config: theme registered under "${key}" declares key "${theme.key}". ` +
          'They must match, or lookups that round-trip through one will miss.',
      )
    }
  }

  if (!(config.defaultTheme in config.themes)) {
    throw new Error(
      `forum.config: defaultTheme "${config.defaultTheme}" is not registered. ` +
        `Available: ${keys.join(', ')}`,
    )
  }

  const pluginKeys = (config.plugins ?? []).map((p) => p.key)
  const duplicate = pluginKeys.find((k, i) => pluginKeys.indexOf(k) !== i)
  if (duplicate !== undefined) {
    throw new Error(`forum.config: plugin "${duplicate}" is registered twice.`)
  }

  return config
}
