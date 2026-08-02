/**
 * F64's save, at the app layer.
 *
 * The registry's validation is tested in `@forum/settings` and the store
 * against real Postgres. What is proven here is the part only this adapter can
 * get wrong, and one of them is the whole reason the form carries a hidden
 * field:
 *
 * **A save from a filtered screen must not touch what it was not showing.** An
 * unchecked checkbox submits *nothing*, and a form cannot tell "off" from "not
 * here" — so an action that iterated the registry would read every boolean the
 * operator could not see as `false` and turn the features behind them off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsSnapshot } from '@forum/settings'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const snapshotRef = { current: SettingsSnapshot.fromOverrides(new Map()) }
vi.mock('./settings', () => ({ getSettings: async () => snapshotRef.current }))

const invalidated: string[][] = []
vi.mock('@forum/drivers', () => ({
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
vi.mock('@forum/db', () => ({
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
  written.length = 0
  deleted.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  snapshotRef.current = SettingsSnapshot.fromOverrides(new Map())
})

describe('the admin gate', () => {
  it('is asked for on every save, not left to the layout', async () => {
    /*
     * A layout is not a security boundary — F63's rule, and this is a Server
     * Action, which is a public endpoint reachable without rendering any page
     * at all. Kills the mutant that drops the call.
     */
    await saveAdminSettingsAction({}, form({ keys: 'board.name', 'board.name': 'X' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'X' }),
    )

    expect(state.error).toBeDefined()
    expect(written).toEqual([])
  })
})

describe('what a submission may touch', () => {
  it('is exactly what the form declared, and nothing else', async () => {
    /*
     * The claim this file exists for. `search.enabled` defaults to true and is
     * not on this form; if the action iterated the registry it would read the
     * absent checkbox as `false` and switch search off on a save of the board
     * name. Kills the mutant that replaces `submittedKeys` with the registry.
     */
    await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'A new name' }),
    )

    expect([...(written[0] ?? new Map()).keys()]).toEqual(['board.name'])
    expect(deleted).toEqual([])
  })

  it('reads an absent checkbox as false when the form did declare it', async () => {
    /*
     * The other half: within the declared set, absence *is* off. That is what a
     * checkbox means, and it is why the declared set has to be explicit.
     */
    snapshotRef.current = SettingsSnapshot.fromOverrides(new Map())
    await saveAdminSettingsAction({}, form({ keys: 'search.enabled' }))

    /* `search.enabled` defaults to true, so false is a change and is written. */
    expect([...(written[0] ?? new Map()).keys()]).toEqual(['search.enabled'])
  })

  it('refuses a submission that declared nothing', async () => {
    const state = await saveAdminSettingsAction({}, form({ keys: '' }))
    expect(state.error).toMatch(/no settings/)
    expect(written).toEqual([])
  })

  it('ignores a declared key that is not a real setting', async () => {
    /*
     * The hidden field is form data and therefore attacker-supplied. An unknown
     * key is dropped here rather than passed to `saveSettings`, which would
     * reject the whole batch — one forged key would otherwise be a way to stop
     * an administrator saving anything.
     */
    await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name,not.a.setting', 'board.name': 'A new name' }),
    )

    expect([...(written[0] ?? new Map()).keys()]).toEqual(['board.name'])
  })
})

describe('caches and the audit log', () => {
  it('invalidates the settings tag and whatever the changed keys declare', async () => {
    /*
     * F08 has carried `invalidates` since it was written with nothing calling
     * it. `board.name` declares `layout`, so both go.
     */
    await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'A new name' }),
    )

    expect(invalidated[0]).toContain('settings')
    expect(invalidated[0]).toContain('layout')
  })

  it('records which settings changed, and never what they became', async () => {
    /*
     * A settings value can be a secret, and the log is read by more people than
     * can edit it. Kills the mutant that logs the values.
     */
    await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'A new name' }),
    )

    expect(adminCalls).toEqual([
      { action: 'settings.changed', detail: { keys: ['board.name'] } },
    ])
    expect(JSON.stringify(adminCalls)).not.toContain('A new name')
  })

  it('does neither when nothing actually changed', async () => {
    /*
     * Saving a form without editing it is the commonest thing an operator does.
     * A cache flush and an audit row for it would make both useless.
     */
    const state = await saveAdminSettingsAction(
      {},
      form({ keys: 'board.name', 'board.name': 'Forum' }),
    )

    expect(state.notice).toBe('unchanged')
    expect(invalidated).toEqual([])
    expect(adminCalls).toEqual([])
  })
})

describe('validation', () => {
  it('reports a bad value and writes none of the batch', async () => {
    /*
     * `saveSettings` validates the whole batch before writing any of it, so a
     * form with one bad field cannot leave the board half-configured.
     */
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
