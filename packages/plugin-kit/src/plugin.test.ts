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
    const migration = (id: string) => ({
      id,
      statements: ['create table if not exists plugin_example_note (id serial primary key)'],
    })

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

    const single = (statement: string) => ({
      migrations: [{ id: '0001_init', statements: [statement] }],
    })

    it.each([
      'create table notes (id int)',
      'create table plugin_other_notes (id int)',
      'alter table users add column plugin_example_flag boolean',
      'drop table posts',
      'create index plugin_example_idx on users (id)',
      'create index users_idx on plugin_example_note (id)',
      'insert into settings values (1)',
      'update usergroups set title = 1',
      'delete from user_group_memberships',
      'truncate users',
    ])('refuses DDL and writes outside the prefix: %s', (statement) => {
      expect(() => plugin(single(statement))).toThrow(/namespace|plugin_example_/)
    })

    it.each([
      'select 1',
      'grant all on plugin_example_note to public',
      'set statement_timeout = 0',
      'create extension pgcrypto',
    ])('refuses a statement form migrations may not use: %s', (statement) => {
      expect(() => plugin(single(statement))).toThrow(/not a form plugin/)
    })

    it('refuses a foreign key that reaches a core table', () => {
      expect(() =>
        plugin(
          single(
            'create table plugin_example_pass (id serial primary key, user_id int references users(id))',
          ),
        ),
      ).toThrow(/foreign key/)
    })

    it.each([
      'create table if not exists plugin_example_note (id serial primary key)',
      'CREATE TABLE "plugin_example_caps" (id int)',
      'create table public.plugin_example_schema (id int)',
      'alter table plugin_example_note add column note text',
      'create unique index if not exists plugin_example_note_key on plugin_example_note (note)',
      'insert into plugin_example_note (note) values ($1)',
      "update plugin_example_note set note = 'x'",
      'delete from plugin_example_note where id = 1',
      'comment on table plugin_example_note is s',
      'create table plugin_example_pair (a int references plugin_example_note(id))',
    ])('accepts its own namespace: %s', (statement) => {
      expect(() => plugin(single(statement))).not.toThrow()
    })

    it('a hyphenated key namespaces with underscores', () => {
      expect(() =>
        plugin({
          key: 'two-words',
          migrations: [
            { id: '0001_init', statements: ['create table plugin_two_words_note (id int)'] },
          ],
        }),
      ).not.toThrow()
    })
  })

  describe('typed settings', () => {
    const setting = (overrides: Record<string, unknown> = {}) => ({
      settings: [{ key: 'api_key', label: 'Key', default: '', ...overrides }],
    })

    it('refuses a type that disagrees with the default', () => {
      expect(() => plugin(setting({ type: 'number' }))).toThrow(/cannot disagree/)
      expect(() => plugin(setting({ type: 'boolean', default: 'x' }))).toThrow(/cannot disagree/)
    })

    it('refuses a secret with a shipped default', () => {
      expect(() => plugin(setting({ type: 'secret', default: 'sk_live_oops' }))).toThrow(
        /shipped secret/i,
      )
      expect(() => plugin(setting({ type: 'secret' }))).not.toThrow()
    })

    it('refuses a select without options, or defaulting off the list', () => {
      expect(() => plugin(setting({ type: 'select' }))).toThrow(/options/)
      expect(() =>
        plugin(
          setting({
            type: 'select',
            default: 'x',
            options: [{ value: 'a', label: 'A' }],
          }),
        ),
      ).toThrow(/not one of its options/)
    })

    it('refuses a malformed environment variable name', () => {
      expect(() => plugin(setting({ env: 'lower_case' }))).toThrow(/environment variable/)
      expect(() => plugin(setting({ env: 'MY_PLUGIN_KEY' }))).not.toThrow()
    })
  })

  describe('routes and pages', () => {
    const route = (overrides: Record<string, unknown> = {}) => ({
      path: 'ping',
      method: 'GET' as const,
      access: 'anonymous' as const,
      handler: () => ({ kind: 'json' as const, body: {} }),
      ...overrides,
    })

    it('accepts single- and multi-segment route paths', () => {
      expect(() =>
        plugin({ routes: [route(), route({ path: 'hook/stripe', method: 'POST' })] }),
      ).not.toThrow()
    })

    it.each(['Hook', 'hook//x', '/hook', 'hook/', 'a/b/c/d/e', 'hook/../x', ''])(
      'refuses the route path %o',
      (path) => {
        expect(() => plugin({ routes: [route({ path })] })).toThrow(/route path/)
      },
    )

    it('refuses two routes on the same method and path, but allows a GET/POST pair', () => {
      expect(() => plugin({ routes: [route(), route()] })).toThrow(/declared twice/)
      expect(() => plugin({ routes: [route(), route({ method: 'POST' })] })).not.toThrow()
    })

    it('refuses a bad access value, a bad method, and a missing handler', () => {
      expect(() => plugin({ routes: [route({ access: 'staff' })] })).toThrow(/access/)
      expect(() => plugin({ routes: [route({ method: 'DELETE' })] })).toThrow(/method/)
      expect(() => plugin({ routes: [route({ handler: undefined })] })).toThrow(/handler/)
    })

    it('accepts an admin route — the panel is a caller, not a special case', () => {
      expect(() => plugin({ routes: [route({ access: 'admin' })] })).not.toThrow()
    })

    it('bounds the body cap', () => {
      expect(() => plugin({ routes: [route({ maxBodyBytes: 0 })] })).toThrow(/maxBodyBytes/)
      expect(() => plugin({ routes: [route({ maxBodyBytes: 10_000_000 })] })).toThrow(
        /maxBodyBytes/,
      )
      expect(() => plugin({ routes: [route({ maxBodyBytes: 1024 })] })).not.toThrow()
    })

    const page = (overrides: Record<string, unknown> = {}) => ({
      path: '',
      title: 'Index',
      access: 'member' as const,
      render: () => null,
      ...overrides,
    })

    it('accepts an index page and a named page', () => {
      expect(() => plugin({ pages: [page(), page({ path: 'manage' })] })).not.toThrow()
    })

    it('refuses a slashed page path, an untitled page, and a duplicate', () => {
      expect(() => plugin({ pages: [page({ path: 'a/b' })] })).toThrow(/page path/)
      expect(() => plugin({ pages: [page({ title: '  ' })] })).toThrow(/title/)
      expect(() => plugin({ pages: [page(), page()] })).toThrow(/declared twice/)
    })

    it('refuses an admin board page — the panel renders adminPages, not pages', () => {
      expect(() => plugin({ pages: [page({ access: 'admin' })] })).toThrow(/access/)
    })

    it('accepts bare redirect hosts and refuses anything with more than a host in it', () => {
      expect(() => plugin({ allowedRedirectHosts: ['checkout.stripe.com'] })).not.toThrow()
      for (const host of ['https://x.com', 'x.com/path', 'x.com:8443', 'localhost', '']) {
        expect(() => plugin({ allowedRedirectHosts: [host] })).toThrow(/host/)
      }
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
