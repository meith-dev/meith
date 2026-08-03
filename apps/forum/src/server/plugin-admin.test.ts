/**
 * F69's inventory.
 *
 * One rule worth a test, and it is the one a reader gets wrong from the type:
 * `InstalledPlugin.enabled` is optional, and **absent means enabled**. A plugin
 * somebody added to `forum.config.ts` is one they want; reading `undefined` as
 * "off" would make every plugin registered without the flag silently inert, and
 * the symptom would be a plugin that installs cleanly and does nothing.
 */
import { describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean }>,
  },
}

vi.mock('../../forum.config', () => ({
  get default() {
    return config.current
  },
}))

const { configuredPlugins } = await import('./plugin-admin')

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
    expect(configuredPlugins()).toEqual([{ key: 'example', enabled: true }])
  })

  it('honours an explicit false', () => {
    config.current.plugins = [{ key: 'example', enabled: false }]
    expect(configuredPlugins()[0]?.enabled).toBe(false)
  })

  it('honours an explicit true', () => {
    config.current.plugins = [{ key: 'example', enabled: true }]
    expect(configuredPlugins()[0]?.enabled).toBe(true)
  })

  it('keeps the configured order, which is the order they load in', () => {
    config.current.plugins = [{ key: 'b' }, { key: 'a' }]
    expect(configuredPlugins().map((plugin) => plugin.key)).toEqual(['b', 'a'])
  })
})
