export interface InstalledTheme<TTheme = unknown> {
  readonly key: string
  readonly title: string
  readonly tokens: {
    readonly light: Readonly<Record<string, string>>
    readonly dark: Readonly<Record<string, string>>
  }
  readonly browserThemeColor?: { readonly light: string; readonly dark: string } | undefined
  readonly theme?: TTheme | undefined
}

export interface InstalledPlugin<TPlugin = unknown> {
  readonly key: string
  readonly enabled?: boolean | undefined
  readonly plugin?: TPlugin | undefined
}

export interface ForumConfig<TTheme = unknown, TPlugin = unknown> {
  readonly themes: Readonly<Record<string, InstalledTheme<TTheme>>>
  readonly defaultTheme: string
  readonly plugins?: readonly InstalledPlugin<TPlugin>[] | undefined
}

export function defineForumConfig<TTheme, TPlugin>(
  config: ForumConfig<TTheme, TPlugin>,
): ForumConfig<TTheme, TPlugin> {
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
