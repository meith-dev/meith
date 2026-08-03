/**
 * The board's plugin registry, read from `forum.config.ts` (F69/F79).
 *
 * One rule worth a test, and it is the one a reader gets wrong from the type:
 * `InstalledPlugin.enabled` is optional, and **absent means enabled**. A plugin
 * somebody added to the config is one they want; reading `undefined` as "off"
 * would make every plugin registered without the flag silently inert, and the
 * symptom would be a plugin that installs cleanly and does nothing.
 */
import { describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}

vi.mock('../../forum.config', () => ({
  get default() {
    return config.current
  },
}))

const { configuredPlugins } = await import('./plugin-host')

describe('configuredPlugins', () => {
  it('is empty when nothing is configured', () => {
    config.current.plugins = []
    expect(configuredPlugins()).toEqual([])
  })

  it('reads an absent flag as enabled', () => {
    /*
     * Kills the mutant that writes `plugin.enabled === true`. A plugin
     * registered without the flag would otherwise report as disabled, and the
     * failure it describes — installed, listed, inert — is one nobody would
     * think to look for here.
     */
    config.current.plugins = [{ key: 'example' }]
    expect(configuredPlugins()[0]).toEqual({
      key: 'example',
      enabled: true,
      hasDefinition: false,
      name: null,
      version: null,
    })
  })

  it('honours an explicit false', () => {
    config.current.plugins = [{ key: 'example', enabled: false }]
    expect(configuredPlugins()[0]?.enabled).toBe(false)
  })

  it('honours an explicit true', () => {
    config.current.plugins = [{ key: 'example', enabled: true }]
    expect(configuredPlugins()[0]?.enabled).toBe(true)
  })

  /*
   * F79. An entry may name a key and carry no definition — a board listing a
   * plugin it has switched off does not need its code path bundled. The screen
   * has to be able to tell that apart from a plugin that is installed and
   * running, or "enabled" means two different things in one column.
   */
  it('distinguishes an entry with a definition from a bare key', () => {
    config.current.plugins = [
      { key: 'bare' },
      { key: 'real', plugin: { key: 'real', name: 'Real', version: '2.1.0' } },
    ]

    expect(configuredPlugins()[0]).toMatchObject({ hasDefinition: false, name: null })
    expect(configuredPlugins()[1]).toMatchObject({
      hasDefinition: true,
      name: 'Real',
      version: '2.1.0',
    })
  })

  it('keeps the configured order, which is the order they load in', () => {
    config.current.plugins = [{ key: 'b' }, { key: 'a' }]
    expect(configuredPlugins().map((plugin) => plugin.key)).toEqual(['b', 'a'])
  })
})
