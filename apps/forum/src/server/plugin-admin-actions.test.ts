import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const adminCalls: Array<{ action: string; detail: unknown }> = []
vi.mock('./admin', () => ({
  requireAdmin: async () => ({ userId: 1 }),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const synced = { count: 0 }
vi.mock('./plugin-host', () => ({
  syncOperatorDisables: async () => {
    synced.count += 1
  },
}))

const invalidated: string[][] = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
  }),
}))

const written: Array<Map<string, string>> = []
const deleted: string[][] = []
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSettingsRepository: class {
    async save(values: Map<string, string>) {
      written.push(values)
    }
    async delete(keys: string[]) {
      deleted.push(keys)
    }
  },
}))

const { savePluginSettingsAction, setPluginEnabledAction } = await import('./plugin-admin-actions')

const ALPHA = {
  key: 'alpha',
  name: 'Alpha',
  version: '1.0.0',
  settings: [
    { key: 'api_url', label: 'URL', default: 'https://example.test' },
    { key: 'batch', label: 'Batch', default: 10 },
    { key: 'verbose', label: 'Verbose', default: false },
  ],
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  config.current.plugins = [{ key: 'alpha', plugin: ALPHA }]
  adminCalls.length = 0
  invalidated.length = 0
  written.length = 0
  deleted.length = 0
  synced.count = 0
})

describe('the switch', () => {
  it('stores "0" to disable', async () => {
    const state = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(state).toEqual({ notice: 'disabled' })
    expect([...(written[0] ?? [])]).toEqual([['plugin.alpha._enabled', '0']])
    expect(adminCalls[0]).toEqual({ action: 'plugin.disabled', detail: { plugin: 'alpha' } })
  })

  it('deletes the row to enable, rather than storing "1"', async () => {
    const state = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '1' }))

    expect(state).toEqual({ notice: 'enabled' })
    expect(deleted[0]).toEqual(['plugin.alpha._enabled'])
    expect(written).toEqual([])
  })

  it('reconciles the host before returning', async () => {
    await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))
    expect(synced.count).toBe(1)
    expect(invalidated[0]).toContain('settings')
  })

  it('refuses a plugin this build does not contain', async () => {
    const state = await setPluginEnabledAction({}, form({ key: 'ghost', enabled: '0' }))

    expect(state.error).toContain('ghost')
    expect(written).toEqual([])
    expect(deleted).toEqual([])
  })

  it('refuses an entry that names a key and carries no code', async () => {
    config.current.plugins = [{ key: 'bare' }]
    const state = await setPluginEnabledAction({}, form({ key: 'bare', enabled: '0' }))

    expect(state.error).toContain('bare')
    expect(written).toEqual([])
  })
})

describe('saving settings', () => {
  it('writes every declared setting, namespaced', async () => {
    const state = await savePluginSettingsAction(
      {},
      form({
        key: 'alpha',
        'setting.api_url': 'https://other.test',
        'setting.batch': '25',
        'setting.verbose': '1',
      }),
    )

    expect(state).toEqual({ notice: 'saved' })
    expect([...(written[0] ?? [])]).toEqual([
      ['plugin.alpha.api_url', 'https://other.test'],
      ['plugin.alpha.batch', '25'],
      ['plugin.alpha.verbose', '1'],
    ])
  })

  it('reads an absent checkbox as false', async () => {
    await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'https://other.test', 'setting.batch': '25' }),
    )

    expect(written[0]?.get('plugin.alpha.verbose')).toBe('0')
  })

  it('refuses a number field that is empty rather than storing zero', async () => {
    const state = await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'x', 'setting.batch': '' }),
    )

    expect(state.error).toContain('Batch')
    expect(written).toEqual([])
  })

  it('refuses a number field that is not a number', async () => {
    const state = await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'x', 'setting.batch': 'lots' }),
    )

    expect(state.error).toContain('Batch')
    expect(written).toEqual([])
  })

  it('ignores a submitted field the plugin does not declare', async () => {
    await savePluginSettingsAction(
      {},
      form({
        key: 'alpha',
        'setting.api_url': 'x',
        'setting.batch': '1',
        'setting.verbose': '1',
        'setting.smuggled': 'yes',
      }),
    )

    expect([...(written[0]?.keys() ?? [])]).not.toContain('plugin.alpha.smuggled')
  })

  it('records the keys it changed and never their values', async () => {
    await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'sk-a-secret', 'setting.batch': '1' }),
    )

    expect(adminCalls[0]?.action).toBe('plugin.configured')
    expect(JSON.stringify(adminCalls[0]?.detail)).not.toContain('sk-a-secret')
    expect(adminCalls[0]?.detail).toEqual({
      plugin: 'alpha',
      keys: ['plugin.alpha.api_url', 'plugin.alpha.batch', 'plugin.alpha.verbose'],
    })
  })

  it('refuses a plugin that declares no settings', async () => {
    config.current.plugins = [{ key: 'alpha', plugin: { ...ALPHA, settings: [] } }]
    const state = await savePluginSettingsAction({}, form({ key: 'alpha' }))

    expect(state.error).toContain('no settings')
    expect(written).toEqual([])
  })
})
