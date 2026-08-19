import { beforeEach, describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}
const revalidated: string[] = []
vi.mock('next/cache', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    revalidatePath: (path: string) => {
      revalidated.push(path)
    },
  }
})

vi.mock('../../community.config', () => ({
  get default() {
    return config.current
  },
}))

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const requireFreshAdminMock = vi.fn(async () => ({ userId: 1 }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const overrides = { current: new Map<string, string>() }
vi.mock('./settings', () => ({
  getSettingOverrides: async () => overrides.current,
}))

const synced = { count: 0 }
const faults: Array<{ plugin: string; surface: string }> = []
vi.mock('./plugin-host', () => ({
  syncPluginEnablement: async () => {
    synced.count += 1
  },
  invalidatePluginHealth: async () => {},
  reconcilePluginHealth: async () => {},
  recordPluginFault: async (plugin: string, surface: string) => {
    faults.push({ plugin, surface })
  },
}))

const dataSource = { current: 'postgres' as 'postgres' | 'fixture' }
vi.mock('@meith/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@meith/core')>()),
  get env() {
    return { DATA_SOURCE: dataSource.current }
  },
}))

const lifecycle: string[] = []
const lifecycleThrows = { current: false }
vi.mock('@meith/runtime', () => ({
  runPluginLifecycle: async (input: { plugin: { key: string }; phase: string }) => {
    if (lifecycleThrows.current) throw new Error('the plugin threw')
    lifecycle.push(`${input.plugin.key}:${input.phase}`)
    return { ran: true }
  },
}))

const navigationSyncs = { count: 0 }
vi.mock('./navigation', () => ({
  syncPluginNavigation: async () => {
    navigationSyncs.count += 1
  },
}))

const emitted: Array<{ name: string; value: unknown }> = []
vi.mock('./plugin-view', () => ({
  emitEvent: async (name: string, value: unknown) => {
    emitted.push({ name, value })
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
vi.mock('@meith/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@meith/db')>()),
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
  overrides.current = new Map()
  adminCalls.length = 0
  invalidated.length = 0
  revalidated.length = 0
  written.length = 0
  deleted.length = 0
  synced.count = 0
  navigationSyncs.count = 0
  emitted.length = 0
  lifecycle.length = 0
  lifecycleThrows.current = false
  faults.length = 0
  dataSource.current = 'postgres'
  vi.unstubAllEnvs()
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ userId: 1 })
})

const staleProof = () =>
  Object.assign(new Error('confirm'), {
    code: 'FORBIDDEN',
    publicMessage: 'Confirm your password again before doing this.',
  })

describe('the admin gate', () => {
  it('asks for a fresh password before taking a plugin off the board', async () => {
    await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('switches nothing off when the proof is stale', async () => {
    requireFreshAdminMock.mockRejectedValue(staleProof())

    const state = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(state.error).toBeDefined()
    expect(written).toEqual([])
    expect(adminCalls).toEqual([])
    expect(synced.count).toBe(0)
  })

  it('puts a plugin back, and saves settings, on the panel session alone', async () => {
    requireFreshAdminMock.mockRejectedValue(staleProof())

    const back = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '1' }))
    const settings = await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'https://other.test', 'setting.batch': '1' }),
    )

    expect(back.notice).toBe('enabled')
    expect(settings.notice).toBe('saved')
    expect(requireAdminMock).toHaveBeenCalledTimes(2)
    expect(requireFreshAdminMock).not.toHaveBeenCalled()
  })
})

describe('the switch', () => {
  it('stores "0" to disable', async () => {
    const state = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(state).toEqual({ notice: 'disabled' })
    expect(emitted).toContainEqual({
      name: 'plugin.disabled',
      value: { pluginKey: 'alpha', reason: 'operator' },
    })
    expect(lifecycle).toEqual(['alpha:disable'])
    expect([...(written[0] ?? [])]).toEqual([['plugin.alpha._enabled', '0']])
    expect(adminCalls[0]).toEqual({ action: 'plugin.disabled', detail: { plugin: 'alpha' } })
  })

  it('runs onEnable when the operator puts a plugin back', async () => {
    overrides.current = new Map([['plugin.alpha._enabled', '0']])

    await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '1' }))

    expect(lifecycle).toEqual(['alpha:enable'])
  })

  it('leaves the switch thrown when the callback fails, and counts it against the plugin', async () => {
    lifecycleThrows.current = true

    const state = await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(state).toEqual({ notice: 'disabled' })
    expect([...(written[0] ?? [])]).toEqual([['plugin.alpha._enabled', '0']])
    expect(faults).toEqual([{ plugin: 'alpha', surface: 'onDisable' }])
  })

  it('does not reach for the plugin on a board with no database', async () => {
    dataSource.current = 'fixture'

    await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))

    expect(lifecycle).toEqual([])
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

  it('leaves a setting the environment owns unwritten', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: {
          ...ALPHA,
          settings: [
            { key: 'api_url', label: 'URL', env: 'ALPHA_API_URL', default: 'https://example.test' },
            { key: 'batch', label: 'Batch', default: 10 },
          ],
        },
      },
    ]
    vi.stubEnv('ALPHA_API_URL', 'https://from-the-environment.test')

    const state = await savePluginSettingsAction({}, form({ key: 'alpha', 'setting.batch': '25' }))

    expect(state.notice).toBe('saved')
    expect([...(written[0] ?? [])]).toEqual([['plugin.alpha.batch', '25']])
  })

  it('leaves an env-owned boolean unwritten rather than storing the inert box as "0"', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: {
          ...ALPHA,
          settings: [
            { key: 'api_url', label: 'URL', default: 'https://example.test' },
            { key: 'verbose', label: 'Verbose', env: 'ALPHA_VERBOSE', default: false },
          ],
        },
      },
    ]
    vi.stubEnv('ALPHA_VERBOSE', '1')

    const state = await savePluginSettingsAction(
      {},
      form({ key: 'alpha', 'setting.api_url': 'https://other.test' }),
    )

    expect(state.notice).toBe('saved')
    expect([...(written[0]?.keys() ?? [])]).toEqual(['plugin.alpha.api_url'])
    expect(written[0]?.has('plugin.alpha.verbose')).toBe(false)
    expect(adminCalls[0]?.detail).toEqual({ plugin: 'alpha', keys: ['plugin.alpha.api_url'] })
  })

  it('still writes a boolean whose variable is declared and unset', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: {
          ...ALPHA,
          settings: [{ key: 'verbose', label: 'Verbose', env: 'ALPHA_VERBOSE', default: false }],
        },
      },
    ]

    await savePluginSettingsAction({}, form({ key: 'alpha', 'setting.verbose': '1' }))

    expect(written[0]?.get('plugin.alpha.verbose')).toBe('1')
  })

  it('refuses a plugin that declares no settings', async () => {
    config.current.plugins = [{ key: 'alpha', plugin: { ...ALPHA, settings: [] } }]
    const state = await savePluginSettingsAction({}, form({ key: 'alpha' }))

    expect(state.error).toContain('no settings')
    expect(written).toEqual([])
  })
})

describe('the screens a plugin write is read back from', () => {
  it('are refreshed when the switch is thrown', async () => {
    await setPluginEnabledAction({}, form({ key: 'alpha', enabled: '0' }))
    expect(revalidated).toEqual(['/admin/plugins', '/admin/plugins/[key]/[[...path]]'])
  })

  it('are left alone when the key names no installed plugin', async () => {
    await setPluginEnabledAction({}, form({ key: 'nothing-installed', enabled: '0' }))
    expect(revalidated).toEqual([])
  })
})
