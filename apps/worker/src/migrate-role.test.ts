import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    DATA_SOURCE: 'postgres',
    DATABASE_URL: 'postgres://u:p@db/board',
    FILESTORE_DRIVER: 'local',
    UPLOADS_DIR: '/tmp/uploads',
    BACKUP_DIR: '/tmp/backups',
  },
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  pending: vi.fn(async (): Promise<readonly string[]> => []),
  installed: vi.fn(async () => true),
  runMigrations: vi.fn(async () => 2),
  record: vi.fn(async () => undefined),
  createBackup: vi.fn(),
  settings: vi.fn(async () => ({
    beforeUpgrade: true,
    uploads: 'include',
    retention: { keep: 7 },
    destination: { source: 'none', config: null, problem: null },
  })),
}))

vi.mock('@meith/core', () => ({
  assertEnv: () => mocks.env,
  logger: () => ({ error: mocks.error, info: mocks.info, warn: mocks.warn }),
}))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  isInstalled: mocks.installed,
  pendingCoreMigrations: mocks.pending,
  runMigrations: mocks.runMigrations,
  PostgresBackupRunRepository: class {
    record = mocks.record
  },
}))
vi.mock('@meith/backup', () => ({ createBackup: mocks.createBackup }))
vi.mock('@meith/runtime', () => ({
  backupDestinationFor: () => undefined,
  backupLog: () => ({ info: () => undefined, warn: () => undefined }),
  backupRingDirectory: (environment: { BACKUP_DIR: string }) => environment.BACKUP_DIR,
  backupSourceFrom: () => ({ filestore: 'local' }),
  loadBackupSettings: mocks.settings,
}))

import { backupBeforeMigrating, migrate } from './migrate-role'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pending.mockResolvedValue(['0068_backup_runs'])
  mocks.installed.mockResolvedValue(true)
  mocks.createBackup.mockResolvedValue({
    name: 'meith-backup-2026-09-02T02-30-20Z.tar.gz',
    size: 10,
    uploads: 'included',
    skippedKeys: [],
    shipped: null,
  })
})

describe('the migrate role', () => {
  it('takes a bundle before a pending migration when the settings ask for one', async () => {
    expect(await backupBeforeMigrating()).toBe('taken')
    expect(mocks.createBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        uploads: 'include',
        target: expect.objectContaining({ dir: '/tmp/backups' }),
      }),
    )
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'upgrade',
        outcome: expect.objectContaining({ status: 'done' }),
      }),
    )
    expect(await migrate('/app/migrations')).toBe(0)
    expect(mocks.runMigrations).toHaveBeenCalledWith({ folder: '/app/migrations' })
  })

  it('skips the backup when nothing is pending, the board is not installed, or it is off', async () => {
    mocks.pending.mockResolvedValueOnce([])
    expect(await backupBeforeMigrating()).toBe('skipped')

    mocks.installed.mockResolvedValueOnce(false)
    expect(await backupBeforeMigrating()).toBe('skipped')

    mocks.settings.mockResolvedValueOnce({
      beforeUpgrade: false,
      uploads: 'include',
      retention: { keep: 7 },
      destination: { source: 'none', config: null, problem: null },
    })
    expect(await backupBeforeMigrating()).toBe('skipped')
    expect(mocks.createBackup).not.toHaveBeenCalled()
  })

  it('refuses to migrate when the backup it was asked for fails', async () => {
    mocks.createBackup.mockRejectedValueOnce(new Error('pg_dump exited with code 1'))

    expect(await migrate('/app/migrations')).toBe(1)
    expect(mocks.runMigrations).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: expect.objectContaining({ status: 'failed' }) }),
    )
  })

  it('migrates without a backup when the settings cannot be read', async () => {
    mocks.settings.mockRejectedValueOnce(new Error('relation "settings" does not exist'))

    expect(await migrate('/app/migrations')).toBe(0)
    expect(mocks.createBackup).not.toHaveBeenCalled()
    expect(mocks.runMigrations).toHaveBeenCalled()
  })
})
