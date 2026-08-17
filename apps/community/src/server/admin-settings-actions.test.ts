import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsSnapshot } from '@meith/settings'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
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

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const snapshotRef = { current: SettingsSnapshot.fromOverrides(new Map()) }
vi.mock('./settings', () => ({ getSettings: async () => snapshotRef.current }))

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
    async loadAll() {
      return new Map()
    }
  },
}))

const { saveAdminSettingsAction } = await import('./admin-settings-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  revalidated.length = 0
  written.length = 0
  deleted.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  snapshotRef.current = SettingsSnapshot.fromOverrides(new Map())
})

describe('the admin gate', () => {
  it('is asked for on every save, not left to the layout', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'X' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'X' }))

    expect(state.error).toBeDefined()
    expect(written).toEqual([])
  })
})

describe('what a submission may touch', () => {
  it('is exactly what the form declared, and nothing else', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'A new name' }))

    expect([...(written[0] ?? new Map()).keys()]).toEqual(['board.name'])
    expect(deleted).toEqual([])
  })

  it('reads an absent checkbox as false when the form did declare it', async () => {
    snapshotRef.current = SettingsSnapshot.fromOverrides(new Map())
    await saveAdminSettingsAction({}, form({ keys: 'search.enabled' }))

    expect([...(written[0] ?? new Map()).keys()]).toEqual(['search.enabled'])
  })

  it('refuses a submission that declared nothing', async () => {
    const state = await saveAdminSettingsAction({}, form({ keys: '' }))
    expect(state.error).toMatch(/no settings/)
    expect(written).toEqual([])
  })

  it('ignores a declared key that is not a real setting', async () => {
    await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name,not.a.setting', 'board.name': 'A new name' }),
    )

    expect([...(written[0] ?? new Map()).keys()]).toEqual(['board.name'])
  })
})

describe('caches and the audit log', () => {
  it('invalidates the settings tag and whatever the changed keys declare', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'A new name' }))

    expect(invalidated[0]).toContain('settings')
    expect(invalidated[0]).toContain('layout')
  })

  it('records which settings changed, and never what they became', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'A new name' }))

    expect(adminCalls).toEqual([{ action: 'settings.changed', detail: { keys: ['board.name'] } }])
    expect(JSON.stringify(adminCalls)).not.toContain('A new name')
  })

  it('does neither when nothing actually changed', async () => {
    const state = await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'Meith' }),
    )

    expect(state.notice).toBe('unchanged')
    expect(invalidated).toEqual([])
    expect(adminCalls).toEqual([])
  })
})

describe('a stored secret', () => {
  beforeEach(() => {
    snapshotRef.current = SettingsSnapshot.fromOverrides(new Map([['mail.http_token', 'live-key']]))
  })

  it('survives an ordinary save, because a blank box means unchanged', async () => {
    const state = await saveAdminSettingsAction(
      {},
      form({ keys: 'mail.http_token', 'mail.http_token': '' }),
    )

    expect(state.notice).toBe('unchanged')
    expect(written).toEqual([])
    expect(deleted).toEqual([])
  })

  it('is removed when the clear box is ticked, so the control has a way back', async () => {
    const state = await saveAdminSettingsAction(
      {},
      form({
        keys: 'mail.http_token',
        'mail.http_token': '',
        'mail.http_token__clear': '1',
      }),
    )

    expect(state.notice).toBe('saved')
    expect(deleted).toEqual([['mail.http_token']])
    expect(written).toEqual([])
  })
})

describe('validation', () => {
  it('reports a bad value and writes none of the batch', async () => {
    const state = await saveAdminSettingsAction(
      {},
      form({
        keys: 'board.name,posting.flood_seconds',
        'board.name': 'A new name',
        'posting.flood_seconds': 'not a number',
      }),
    )

    expect(state.error).toMatch(/posting.flood_seconds/)
    expect(written).toEqual([])
  })
})

describe('the screen the save was made on', () => {
  it('is refreshed when something changed', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'Renamed' }))
    expect(revalidated).toEqual(['/admin/settings'])
  })

  it('is left alone when nothing was different, because nothing was written', async () => {
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'Meith' }))
    expect(revalidated).toEqual([])
  })
})
