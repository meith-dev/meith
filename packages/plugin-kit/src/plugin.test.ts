import { describe, expect, it } from 'vitest'

import {
  definePlugin,
  pluginAdminPath,
  pluginSettingKey,
  pluginTaskId,
  type PluginDefinition,
} from './plugin'

function plugin(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return definePlugin({
    key: 'example',
    name: 'Example',
    version: '1.0.0',
    ...overrides,
  })
}

describe('definePlugin', () => {
  it('accepts a minimal manifest', () => {
    expect(plugin().key).toBe('example')
  })

  it.each(['Example', 'e', 'ex_ample', 'plugin.name', 'a/b', '', '1plugin'])(
    'refuses the key %o',
    (key) => {
      expect(() => plugin({ key })).toThrow(/valid plugin key|not a valid/)
    },
  )

  it('refuses a version that is not semver', () => {
    expect(() => plugin({ version: '1.0' })).toThrow(/semver/)
  })

  it('refuses an unknown hook name', () => {
    expect(() => plugin({ hooks: { 'post.create': () => {} } as never })).toThrow(/unknown hook/)
  })

  it('refuses a hook whose handler is not a function', () => {
    expect(() => plugin({ hooks: { 'post.created': 'nope' } as never })).toThrow(/must be a function/)
  })

  it('accepts both the bare handler and the { handler, priority } form', () => {
    expect(() =>
      plugin({
        hooks: {
          'post.created': () => {},
          'user.registered': { handler: () => {}, priority: 10 },
        },
      }),
    ).not.toThrow()
  })

  describe('settings', () => {
    it('refuses a duplicate key', () => {
      expect(() =>
        plugin({
          settings: [
            { key: 'greeting', label: 'A', default: 'x' },
            { key: 'greeting', label: 'B', default: 'y' },
          ],
        }),
      ).toThrow(/setting "greeting" is declared twice/)
    })

    it('refuses a key that would not namespace cleanly', () => {
      expect(() => plugin({ settings: [{ key: 'my.setting', label: 'A', default: 1 }] })).toThrow(
        /lower-case letters, digits and underscores/,
      )
    })
  })

  describe('migrations', () => {
    const migration = (id: string) => ({ id, statements: ['select 1'] })

    it('accepts ascending ids', () => {
      expect(() =>
        plugin({ migrations: [migration('0001_init'), migration('0002_add_column')] }),
      ).not.toThrow()
    })

    it('refuses ids that are not in ascending order', () => {
      expect(() =>
        plugin({ migrations: [migration('0002_second'), migration('0001_first')] }),
      ).toThrow(/ascending id order/)
    })

    it('refuses an id that does not sort predictably', () => {
      expect(() => plugin({ migrations: [migration('init')] })).toThrow(/0001_description/)
    })

    it('refuses a duplicate id', () => {
      expect(() => plugin({ migrations: [migration('0001_a'), migration('0001_a')] })).toThrow(
        /migration "0001_a" is declared twice/,
      )
    })

    it('refuses a migration with no statements', () => {
      expect(() => plugin({ migrations: [{ id: '0001_empty', statements: [] }] })).toThrow(
        /no statements/,
      )
    })
  })

  describe('tasks', () => {
    const task = (id: string, intervalSeconds = 300) => ({ id, intervalSeconds, run: () => {} })

    it('accepts a task at a plausible interval', () => {
      expect(() => plugin({ tasks: [task('sweep')] })).not.toThrow()
    })

    it('refuses an interval the scheduler cannot deliver', () => {
      expect(() => plugin({ tasks: [task('sweep', 30)] })).toThrow(/cannot deliver/)
      expect(() => plugin({ tasks: [task('sweep', 60.5)] })).toThrow(/cannot deliver/)
    })

    it('refuses a duplicate id', () => {
      expect(() => plugin({ tasks: [task('sweep'), task('sweep')] })).toThrow(/declared twice/)
    })
  })

  describe('admin pages', () => {
    const page = (path: string) => ({ path, title: 'T', render: () => null })

    it('accepts a single segment', () => {
      expect(() => plugin({ adminPages: [page('settings')] })).not.toThrow()
    })

    it('refuses a path with a slash or a traversal', () => {
      expect(() => plugin({ adminPages: [page('a/b')] })).toThrow(/single lower-case segment/)
      expect(() => plugin({ adminPages: [page('..')] })).toThrow(/single lower-case segment/)
    })
  })

  describe('UI contributions', () => {
    it('accepts a known region', () => {
      expect(() =>
        plugin({ contributions: [{ region: 'postbit.footer', render: () => null }] }),
      ).not.toThrow()
    })

    it('refuses an unknown region', () => {
      expect(() =>
        plugin({ contributions: [{ region: 'PostBit', render: () => null } as never] }),
      ).toThrow(/unknown UI region/)
    })
  })
})

describe('namespacing', () => {
  it('namespaces settings, tasks and admin routes by plugin key', () => {
    expect(pluginSettingKey('akismet', 'api_key')).toBe('plugin.akismet.api_key')
    expect(pluginTaskId('akismet', 'retrain')).toBe('plugin.akismet.retrain')
    expect(pluginAdminPath('akismet', 'settings')).toBe('/admin/plugins/akismet/settings')
    expect(pluginAdminPath('akismet', '')).toBe('/admin/plugins/akismet')
  })
})
