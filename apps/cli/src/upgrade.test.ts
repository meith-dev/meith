import { beforeEach, describe, expect, it, vi } from 'vitest'

const versions = { current: new Map<string, string>() }
const recorded: Array<{ component: string; version: string }> = []

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  readVersion: async (_db: unknown, component: string) => versions.current.get(component) ?? null,
  recordVersion: async (_db: unknown, component: string, version: string) => {
    recorded.push({ component, version })
    versions.current.set(component, version)
  },
  appliedPluginMigrations: async () => [],
  applyPluginMigration: async () => true,
  runMigrations: async () => 0,
  PostgresNavigationRepository: class {
    async syncPluginItems() {
      return { added: [], removed: [] }
    }
  },
}))

const lifecycle: string[] = []
const installThrows = { current: false }
vi.mock('@meith/runtime', () => ({
  runPluginLifecycle: async (input: { plugin: { key: string }; phase: string }) => {
    if (installThrows.current) throw new Error('could not seed')
    lifecycle.push(`${input.plugin.key}:${input.phase}`)
    return { ran: true }
  },
}))

const { upgrade } = await import('./upgrade')

const lines: string[] = []
const log = (line: string) => void lines.push(line)

function plugin(over: Record<string, unknown> = {}) {
  return {
    key: 'dues',
    name: 'Dues',
    version: '1.0.0',
    migrations: [{ id: '0001_create', statements: ['create table plugin_dues_a (id int)'] }],
    onInstall: () => {},
    ...over,
  } as never
}

beforeEach(() => {
  lines.length = 0
  recorded.length = 0
  lifecycle.length = 0
  installThrows.current = false
  versions.current = new Map([['core', '0.9.0']])
})

describe('onInstall', () => {
  it('runs on the first upgrade that sees the plugin', async () => {
    expect(await upgrade({ dryRun: false, plugins: [plugin()], log })).toBe(0)

    expect(lifecycle).toEqual(['dues:install'])
    expect(lines.join('\n')).toContain('dues: onInstall.')
  })

  it('does not run again once the board has recorded the plugin', async () => {
    versions.current.set('plugin:dues', '1.0.0')

    await upgrade({ dryRun: false, plugins: [plugin()], log })

    expect(lifecycle).toEqual([])
  })

  it('stops the upgrade when it throws, before the version is recorded', async () => {
    installThrows.current = true

    await expect(upgrade({ dryRun: false, plugins: [plugin()], log })).rejects.toThrow(
      'could not seed',
    )

    expect(recorded.map((entry) => entry.component)).not.toContain('plugin:dues')
    expect(recorded.map((entry) => entry.component)).not.toContain('core')
  })

  it('is named in the plan, and does not run, on a dry run', async () => {
    expect(await upgrade({ dryRun: true, plugins: [plugin()], log })).toBe(0)

    expect(lifecycle).toEqual([])
    expect(lines.join('\n')).toContain('dues: onInstall')
  })

  it('is not planned for a plugin that declares none', async () => {
    await upgrade({ dryRun: true, plugins: [plugin({ onInstall: undefined })], log })

    expect(lines.join('\n')).not.toContain('onInstall')
  })
})
