/**
 * The build-time registry (invariant 6).
 *
 * "Everything installable is registered in `community.config.ts`. Nothing is
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
 * So the config is a *module*, imported statically. `defineCommunityConfig` is an
 * identity function whose only job is to attach the type — the same shape as
 * `defineConfig` in tooling everywhere, and for the same reason: it gives
 * editors and `tsc` something to check without a schema at runtime.
 *
 * `plugins` gains a real element type at F79.
 *
 * ## Why the theme's slot map arrives as a type parameter (F25)
 *
 * A registered theme now carries its `ThemeDefinition` — the slot map the app
 * resolves and renders. That type lives in `@meith/theme-kit`, and `@meith/core`
 * is the bottom of the stack: `core-depends-on-nothing` in the
 * dependency-cruiser config makes importing a sibling an error, and rightly, or
 * the graph has no floor.
 *
 * The alternatives were to declare the slot map here as
 * `Record<string, unknown>` and have every reader cast it — casts being exactly
 * what this file's `defineCommunityConfig` exists to avoid — or to move the slot
 * contract into core, which would put React component types in the package the
 * CLI and the worker import. A type parameter costs nothing at runtime, is
 * inferred from the config so no call site spells it out, and keeps core's
 * dependency list empty.
 */

/**
 * What the registry knows about a theme.
 *
 * @typeParam TTheme - the theme's slot definition, `@meith/theme-kit`'s
 * `ThemeDefinition` in practice. Inferred; never written by hand.
 */
export interface InstalledTheme<TTheme = unknown> {
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
  /**
   * The theme's slot definition (F25).
   *
   * Optional because a token-only theme is a legitimate thing to register — F26's
   * per-board restyling changes colours without touching markup — and because a
   * theme that fills no slots should not have to say `slots: {}`.
   */
  readonly theme?: TTheme | undefined
}

/**
 * A registered plugin (F79).
 *
 * `plugin` carries the definition, as a **type parameter** for exactly the
 * reason `InstalledTheme.theme` is one: `PluginDefinition` lives in
 * `@meith/plugin-kit`, which imports React, and `core-depends-on-nothing` keeps
 * this package importable by the CLI and the worker. Inferred from the config,
 * so no call site ever spells it out.
 *
 * It is optional because the *registry entry* and the *definition* answer
 * different questions: `key` and `enabled` are what an operator configured, and
 * a board can legitimately list a plugin it has switched off without the bundler
 * needing to pull in its code path. Everything else about a plugin — its hooks,
 * settings, migrations, tasks — is inside the definition where the plugin
 * declared it, never restated here.
 */
export interface InstalledPlugin<TPlugin = unknown> {
  readonly key: string
  /** Absent means enabled: a plugin somebody added to the config is one they want. */
  readonly enabled?: boolean | undefined
  readonly plugin?: TPlugin | undefined
}

export interface CommunityConfig<TTheme = unknown, TPlugin = unknown> {
  /** Every installed theme, keyed by its `key`. */
  readonly themes: Readonly<Record<string, InstalledTheme<TTheme>>>
  /** Which theme a board uses when it has no preference stored. */
  readonly defaultTheme: string
  readonly plugins?: readonly InstalledPlugin<TPlugin>[] | undefined
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
export function defineCommunityConfig<TTheme, TPlugin>(
  config: CommunityConfig<TTheme, TPlugin>,
): CommunityConfig<TTheme, TPlugin> {
  const keys = Object.keys(config.themes)

  if (keys.length === 0) {
    throw new Error('community.config: at least one theme must be registered.')
  }

  for (const [key, theme] of Object.entries(config.themes)) {
    if (theme.key !== key) {
      throw new Error(
        `community.config: theme registered under "${key}" declares key "${theme.key}". ` +
          'They must match, or lookups that round-trip through one will miss.',
      )
    }
  }

  if (!(config.defaultTheme in config.themes)) {
    throw new Error(
      `community.config: defaultTheme "${config.defaultTheme}" is not registered. ` +
        `Available: ${keys.join(', ')}`,
    )
  }

  const pluginKeys = (config.plugins ?? []).map((p) => p.key)
  const duplicate = pluginKeys.find((k, i) => pluginKeys.indexOf(k) !== i)
  if (duplicate !== undefined) {
    throw new Error(`community.config: plugin "${duplicate}" is registered twice.`)
  }

  /*
   * F79. The registry entry's key and the plugin's own must agree, for the same
   * reason a theme's must: every lookup round-trips through one or the other —
   * settings are stored under `plugin.<key>.…`, tasks and admin routes are
   * namespaced by it — and a mismatch makes a plugin configurable under one name
   * and running under another.
   */
  for (const entry of config.plugins ?? []) {
    const declared = (entry.plugin as { key?: unknown } | undefined)?.key
    if (typeof declared === 'string' && declared !== entry.key) {
      throw new Error(
        `community.config: plugin registered as "${entry.key}" declares key "${declared}". ` +
          'They must match, or its settings and routes are namespaced under a different ' +
          'name than the one you configured.',
      )
    }
  }

  return config
}
