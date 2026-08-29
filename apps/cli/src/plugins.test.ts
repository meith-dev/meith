import { beforeEach, describe, expect, it, vi } from 'vitest'

const purged: string[] = []
const owned = { current: ['plugin_dues_note'] as readonly string[] }

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  pluginOwnedTables: async () => owned.current,
  purgePlugin: async (_db: unknown, key: string) => {
    purged.push(key)
    return {
      tables: owned.current,
      settings: 2,
      migrations: 1,
      navigation: 1,
      versionRemoved: true,
      healthRemoved: false,
    }
  },
}))

const lifecycle: string[] = []
const uninstallThrows = { current: false }
vi.mock('@meith/runtime', () => ({
  runPluginLifecycle: async (input: { plugin: { key: string }; phase: string }) => {
    if (uninstallThrows.current) throw new Error('could not reach Stripe')
    lifecycle.push(`${input.plugin.key}:${input.phase}`)
    return { ran: true }
  },
}))

const { purge } = await import('./plugins')

const dues = { key: 'dues', name: 'Dues', version: '1.0.0', onUninstall: () => {} } as never

const lines: string[] = []
const log = (line: string) => void lines.push(line)

beforeEach(() => {
  lines.length = 0
  purged.length = 0
  lifecycle.length = 0
  owned.current = ['plugin_dues_note']
  uninstallThrows.current = false
})

describe('purge', () => {
  it('refuses a plugin that is not in the build, and says why', async () => {
    expect(await purge({ key: 'gone', plugins: [], confirmed: true, log })).toBe(1)

    expect(purged).toEqual([])
    expect(lines.join('\n')).toContain('while the code is still installed')
  })

  it('describes what it would do, and does nothing, without --yes', async () => {
    expect(await purge({ key: 'dues', plugins: [dues], confirmed: false, log })).toBe(0)

    expect(purged).toEqual([])
    expect(lifecycle).toEqual([])
    expect(lines.join('\n')).toContain('plugin_dues_note')
    expect(lines.join('\n')).toContain('--yes')
  })

  it('runs onUninstall before dropping anything', async () => {
    expect(await purge({ key: 'dues', plugins: [dues], confirmed: true, log })).toBe(0)

    expect(lifecycle).toEqual(['dues:uninstall'])
    expect(purged).toEqual(['dues'])
  })

  it('keeps the plugin’s data when its onUninstall fails', async () => {
    uninstallThrows.current = true

    await expect(purge({ key: 'dues', plugins: [dues], confirmed: true, log })).rejects.toThrow(
      'could not reach Stripe',
    )

    expect(purged).toEqual([])
  })

  it('says what is left to do by hand', async () => {
    await purge({ key: 'dues', plugins: [dues], confirmed: true, log })

    expect(lines.join('\n')).toContain('meith.plugins.ts')
  })
})
