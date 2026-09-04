import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  runMigrations: vi.fn(async () => 2),
  backupBeforeMigrating: vi.fn(async (): Promise<'taken' | 'skipped'> => 'taken'),
}))

vi.mock('@meith/core', () => ({
  logger: () => ({ error: mocks.error, info: mocks.info, warn: vi.fn() }),
}))
vi.mock('@meith/db', () => ({ runMigrations: mocks.runMigrations }))
vi.mock('@meith/runtime', () => ({ backupBeforeMigrating: mocks.backupBeforeMigrating }))

import { migrate } from './migrate-role'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the migrate role', () => {
  it('takes the backup first, then migrates', async () => {
    expect(await migrate('/app/migrations')).toBe(0)
    expect(mocks.backupBeforeMigrating).toHaveBeenCalledOnce()
    expect(mocks.runMigrations).toHaveBeenCalledWith({ folder: '/app/migrations' })
  })

  it('says so when there was nothing to apply', async () => {
    mocks.runMigrations.mockResolvedValueOnce(0)
    expect(await migrate('/app/migrations')).toBe(0)
    expect(mocks.info).toHaveBeenCalledWith({ applied: 0 }, 'already up to date')
  })

  it('refuses to migrate when the backup it was asked for fails', async () => {
    mocks.backupBeforeMigrating.mockRejectedValueOnce(new Error('pg_dump exited with code 1'))

    expect(await migrate('/app/migrations')).toBe(1)
    expect(mocks.runMigrations).not.toHaveBeenCalled()
  })

  it('reports a failed migration', async () => {
    mocks.runMigrations.mockRejectedValueOnce(new Error('relation exists'))

    expect(await migrate('/app/migrations')).toBe(1)
    expect(mocks.error).toHaveBeenCalled()
  })
})
