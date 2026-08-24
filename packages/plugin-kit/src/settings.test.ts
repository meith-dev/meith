import { describe, expect, it } from 'vitest'

import { PluginHost } from './host'
import { definePlugin, type PluginSetting } from './plugin'
import {
  operatorDisabledPlugins,
  parsePluginSetting,
  pluginEnabledKey,
  pluginSettingType,
  resolvePluginSettingDetails,
  resolvePluginSettings,
  serialisePluginSetting,
} from './settings'

const VIEWER = { userId: 1, isGuest: false }

function setting(
  overrides: Partial<PluginSetting> & Pick<PluginSetting, 'default'>,
): PluginSetting {
  return { key: 'thing', label: 'Thing', ...overrides }
}

describe('the reserved key cannot collide with a declared setting', () => {
  it('definePlugin refuses the setting key the enabled flag uses', () => {
    expect(() =>
      definePlugin({
        key: 'demo',
        name: 'Demo',
        version: '1.0.0',
        settings: [setting({ key: '_enabled', default: true })],
      }),
    ).toThrow(/lower-case letters/)
  })

  it('builds the flag key under the plugin’s own namespace', () => {
    expect(pluginEnabledKey('demo')).toBe('plugin.demo._enabled')
  })
})

describe('parsing a stored value against the declared default', () => {
  it('reads the settings registry’s boolean encoding, and "true"/"false" beside it', () => {
    const declared = setting({ default: false })
    expect(parsePluginSetting(declared, '1')).toBe(true)
    expect(parsePluginSetting(declared, '0')).toBe(false)
    expect(parsePluginSetting(declared, 'true')).toBe(true)
    expect(parsePluginSetting(declared, 'false')).toBe(false)
  })

  it('rejects a boolean it does not recognise rather than guessing', () => {
    expect(parsePluginSetting(setting({ default: false }), 'yes')).toBeNull()
  })

  it('rejects an empty numeric field instead of storing zero', () => {
    expect(parsePluginSetting(setting({ default: 10 }), '')).toBeNull()
    expect(parsePluginSetting(setting({ default: 10 }), '   ')).toBeNull()
    expect(parsePluginSetting(setting({ default: 10 }), '25')).toBe(25)
  })

  it('rejects a non-finite number', () => {
    expect(parsePluginSetting(setting({ default: 10 }), 'abc')).toBeNull()
    expect(parsePluginSetting(setting({ default: 10 }), 'Infinity')).toBeNull()
  })

  it('round-trips through the storage encoding', () => {
    const declared = setting({ default: false })
    expect(parsePluginSetting(declared, serialisePluginSetting(true))).toBe(true)
    expect(parsePluginSetting(declared, serialisePluginSetting(false))).toBe(false)
  })
})

describe('resolving a plugin’s settings', () => {
  const plugin = definePlugin({
    key: 'demo',
    name: 'Demo',
    version: '1.0.0',
    settings: [
      { key: 'api_url', label: 'URL', default: 'https://example.test' },
      { key: 'batch', label: 'Batch', default: 10 },
      { key: 'verbose', label: 'Verbose', default: false },
    ],
  })

  it('fills in every declared key on a board that has configured none', () => {
    expect(resolvePluginSettings(plugin, new Map())).toEqual({
      api_url: 'https://example.test',
      batch: 10,
      verbose: false,
    })
  })

  it('applies stored overrides, namespaced by plugin key', () => {
    const resolved = resolvePluginSettings(
      plugin,
      new Map([
        ['plugin.demo.batch', '50'],
        ['plugin.demo.verbose', '1'],
      ]),
    )
    expect(resolved).toEqual({ api_url: 'https://example.test', batch: 50, verbose: true })
  })

  it('ignores another plugin’s row with the same setting name', () => {
    const resolved = resolvePluginSettings(plugin, new Map([['plugin.other.batch', '999']]))
    expect(resolved.batch).toBe(10)
  })

  it('falls back to the default when a stored value no longer parses', () => {
    const resolved = resolvePluginSettings(plugin, new Map([['plugin.demo.batch', 'not-a-number']]))
    expect(resolved.batch).toBe(10)
  })
})

describe('reading the operator’s switch out of the override map', () => {
  it('absence means enabled', () => {
    expect(operatorDisabledPlugins(new Map())).toEqual([])
  })

  it('only "0" disables', () => {
    const overrides = new Map([
      ['plugin.alpha._enabled', '0'],
      ['plugin.bravo._enabled', '1'],
      ['plugin.charlie._enabled', 'off'],
    ])
    expect(operatorDisabledPlugins(overrides)).toEqual(['alpha'])
  })

  it('does not mistake a board setting or a plugin setting for the flag', () => {
    const overrides = new Map([
      ['display.posts_per_page', '0'],
      ['plugin.alpha.batch', '0'],
      ['plugin.alpha.some_enabled', '0'],
    ])
    expect(operatorDisabledPlugins(overrides)).toEqual([])
  })

  it('returns keys sorted, so two instances reconcile identically', () => {
    const overrides = new Map([
      ['plugin.zulu._enabled', '0'],
      ['plugin.alpha._enabled', '0'],
    ])
    expect(operatorDisabledPlugins(overrides)).toEqual(['alpha', 'zulu'])
  })
})

describe('the host’s operator switch', () => {
  const plugin = definePlugin({
    key: 'demo',
    name: 'Demo',
    version: '1.0.0',
    hooks: { 'markdown.render.html': (value) => `${value}!` },
  })

  it('stops the handler being called, and reports itself separately', async () => {
    const host = new PluginHost({ plugins: [plugin] })
    host.setOperatorDisabled(['demo'])

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
    expect(host.health()[0]).toMatchObject({
      enabled: false,
      operatorDisabled: true,
      disabledReason: null,
    })
  })

  it('reconciles against the whole set, so re-enabling needs no second call', async () => {
    const host = new PluginHost({ plugins: [plugin] })
    host.setOperatorDisabled(['demo'])
    host.setOperatorDisabled([])

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x!',
    )
  })

  it('ignores a key naming a plugin this build does not have', () => {
    const host = new PluginHost({ plugins: [plugin] })
    expect(() => host.setOperatorDisabled(['gone'])).not.toThrow()
    expect(host.health()).toHaveLength(1)
  })

  it('re-enabling does not resurrect a plugin auto-disabled for failing', async () => {
    const host = new PluginHost({ plugins: [plugin] })
    host.disable('demo', 'failed 5 times')
    host.setOperatorDisabled(['demo'])
    host.setOperatorDisabled([])

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
    expect(host.health()[0]).toMatchObject({
      enabled: false,
      operatorDisabled: false,
      disabledReason: 'failed 5 times',
    })
  })
})

describe('typed settings and the environment override', () => {
  const plugin = definePlugin({
    key: 'billing',
    name: 'Billing',
    version: '1.0.0',
    settings: [
      {
        key: 'secret_key',
        label: 'API secret',
        type: 'secret',
        env: 'BILLING_SECRET_KEY',
        required: true,
        default: '',
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'live', label: 'Live' },
        ],
        env: 'BILLING_MODE',
        default: 'off',
      },
      { key: 'label', label: 'Label', default: 'Membership' },
    ],
  })

  const none = new Map<string, string>()

  it('environment beats board beats default, and says so', () => {
    const stored = new Map([['plugin.billing.secret_key', 'sk_stored']])
    const env = (name: string) => (name === 'BILLING_SECRET_KEY' ? 'sk_env' : undefined)

    const fromBoth = resolvePluginSettings(plugin, stored, env)
    expect(fromBoth.secret_key).toBe('sk_env')

    const fromBoard = resolvePluginSettings(plugin, stored)
    expect(fromBoard.secret_key).toBe('sk_stored')

    const details = resolvePluginSettingDetails(plugin, stored, env)
    expect(details.map((d) => [d.setting.key, d.source])).toEqual([
      ['secret_key', 'environment'],
      ['mode', 'default'],
      ['label', 'default'],
    ])
  })

  it('an empty environment value does not override', () => {
    const stored = new Map([['plugin.billing.secret_key', 'sk_stored']])
    const resolved = resolvePluginSettings(plugin, stored, () => '  ')
    expect(resolved.secret_key).toBe('sk_stored')
  })

  it('a select outside its options falls back to the default', () => {
    const stored = new Map([['plugin.billing.mode', 'test']])
    expect(resolvePluginSettings(plugin, stored).mode).toBe('off')

    const detail = resolvePluginSettingDetails(plugin, stored).find((d) => d.setting.key === 'mode')
    expect(detail?.source).toBe('default')
  })

  it('a select matches its options case-insensitively, trimmed, and resolves to the option’s own casing', () => {
    const stored = new Map([['plugin.billing.mode', ' LIVE ']])
    const details = resolvePluginSettingDetails(plugin, stored)
    const detail = details.find((d) => d.setting.key === 'mode')
    expect(detail?.value).toBe('live')
    expect(detail?.source).toBe('board')
  })

  it('the same normalisation applies to a select fed from the environment', () => {
    const env = (name: string) => (name === 'BILLING_MODE' ? ' Live ' : undefined)
    expect(resolvePluginSettings(plugin, none, env).mode).toBe('live')
  })

  it('reports a required, unset setting as a problem — naming the variable that could set it', () => {
    const [detail] = resolvePluginSettingDetails(plugin, none)
    expect(detail?.problem).toMatch(/required/)
    expect(detail?.problem).toContain('BILLING_SECRET_KEY')

    const satisfied = resolvePluginSettingDetails(plugin, none, () => 'sk_env')
    expect(satisfied[0]?.problem).toBeNull()
  })

  it('pluginSettingType infers from the default and honours a declaration', () => {
    expect(pluginSettingType({ key: 'a', label: 'a', default: true })).toBe('boolean')
    expect(pluginSettingType({ key: 'a', label: 'a', default: 3 })).toBe('number')
    expect(pluginSettingType({ key: 'a', label: 'a', default: 'x' })).toBe('string')
    expect(pluginSettingType({ key: 'a', label: 'a', type: 'secret', default: '' })).toBe('secret')
  })
})
