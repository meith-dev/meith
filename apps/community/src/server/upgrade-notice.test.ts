import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigurationError, ValidationError } from '@meith/core'

const versions = { current: new Map<string, string>() }
const recorded: string[] = []
const pendingCore = { current: [] as readonly string[] }
const pendingFails = { current: null as Error | null }

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  readVersion: async (_db: unknown, component: string) => versions.current.get(component) ?? null,
  recordVersion: async (_db: unknown, component: string, version: string) => {
    recorded.push(`${component}@${version}`)
  },
  appliedPluginMigrations: async () => [],
  applyPluginMigration: async () => true,
  pendingCoreMigrations: async () => {
    if (pendingFails.current !== null) throw pendingFails.current
    return pendingCore.current
  },
  PostgresNavigationRepository: class {
    async syncPluginItems() {
      return { added: [], removed: [] }
    }
  },
}))

vi.mock('@meith/runtime', () => ({ runPluginLifecycle: async () => ({ ran: false }) }))

vi.mock('./plugin-host', () => ({ activeDefinitions: () => [] }))

const warnings: string[] = []
vi.mock('@meith/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@meith/core')>()
  return {
    ...actual,
    env: { DATA_SOURCE: 'postgres' },
    logger: () => ({
      warn: (_fields: unknown, message: string) => {
        warnings.push(message)
      },
    }),
  }
})

const { applyPendingUpgrade, CODE_VERSION, pendingUpgradeNotice } = await import('./upgrade-notice')

beforeEach(() => {
  recorded.length = 0
  warnings.length = 0
  pendingCore.current = []
  pendingFails.current = null
  versions.current = new Map([['core', CODE_VERSION]])
})

describe('the upgrade notice', () => {
  it('counts the core migrations the schema is missing, even when the versions agree', async () => {
    pendingCore.current = ['0062_pretty_zombie', '0063_board_digest']

    const notice = await pendingUpgradeNotice()

    expect(notice).toContain(`both at ${CODE_VERSION}`)
    expect(notice).toContain('2 migration(s) have never been applied')
    expect(notice).toContain('meith upgrade')
  })

  it('says nothing when nothing is missing', async () => {
    expect(await pendingUpgradeNotice()).toBeNull()
  })

  it('falls back to comparing versions when the count fails, and says so', async () => {
    pendingFails.current = new Error('connection reset')

    expect(await pendingUpgradeNotice()).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('comparing versions only')
  })
})

describe('applying the upgrade from the panel', () => {
  it('refuses while core migrations are missing, naming them, and records nothing', async () => {
    pendingCore.current = ['0063_board_digest']

    const failure = await applyPendingUpgrade().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ValidationError)
    expect(String((failure as Error).message)).toContain('0063_board_digest')
    expect(String((failure as Error).message)).toContain('meith migrate')
    expect(recorded).toEqual([])
  })

  it('records the code version once the schema is current', async () => {
    versions.current = new Map([['core', '0.30.0']])

    await applyPendingUpgrade()

    expect(recorded).toEqual([`core@${CODE_VERSION}`])
  })
})

describe('a runtime that cannot reach the migration files', () => {
  it('asks once, then compares versions without asking again', async () => {
    vi.resetModules()
    const fresh = await import('./upgrade-notice')
    pendingFails.current = new ConfigurationError('Cannot find the migrations.')

    expect(await fresh.pendingUpgradeNotice()).toBeNull()
    pendingFails.current = null
    pendingCore.current = ['0063_board_digest']
    expect(await fresh.pendingUpgradeNotice()).toBeNull()

    expect(warnings).toHaveLength(1)
  })
})
