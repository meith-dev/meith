import { describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}

vi.mock('../../community.config', () => ({
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
