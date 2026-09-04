import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: { DATA_SOURCE: 'postgres' },
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  initTracing: vi.fn(async () => undefined),
  loadEnvFiles: vi.fn(),
  taskHealth: vi.fn(async () => []),
  assessScheduler: vi.fn(() => ({ schedulerStopped: false, stale: [], failing: [] })),
  tick: vi.fn(),
}))

vi.mock('@meith/core', () => ({
  assertEnv: () => mocks.env,
  initTracing: mocks.initTracing,
  logger: () => ({ error: mocks.error, info: mocks.info, warn: mocks.warn }),
}))
vi.mock('@meith/core/env-files', () => ({ loadEnvFiles: mocks.loadEnvFiles }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSystemHealthRepository: class {
    taskHealth = mocks.taskHealth
  },
}))
vi.mock('@meith/drivers', () => ({ drivers: () => ({ queue: {}, mail: {}, files: {} }) }))
vi.mock('@meith/drivers/images', () => ({ imageProcessor: {} }))
vi.mock('@meith/runtime', () => ({
  BACKUP_LEASE_SECONDS: 600,

  buildSchedulerBundle: () => ({ tasks: [{ id: 'one' }], repository: {}, onTaskFailure: vi.fn() }),
}))
vi.mock('@meith/tasks', () => ({ assessScheduler: mocks.assessScheduler, tick: mocks.tick }))

import { checkReady, main } from './lifecycle'

beforeEach(() => {
  mocks.env.DATA_SOURCE = 'postgres'
  mocks.tick.mockReset()
  mocks.tick.mockResolvedValue([])
  mocks.assessScheduler.mockReturnValue({ schedulerStopped: false, stale: [], failing: [] })
})

afterEach(() => {
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  vi.restoreAllMocks()
})

describe('main', () => {
  it('refuses fixture mode', async () => {
    mocks.env.DATA_SOURCE = 'fixture'
    await expect(main()).resolves.toBe(1)
    expect(mocks.error).toHaveBeenCalled()
  })

  it('records outcomes and stops after a signal', async () => {
    mocks.tick.mockImplementationOnce(async () => {
      process.emit('SIGTERM')
      return [
        { status: 'ran', taskId: 'ok', durationMs: 2 },
        { status: 'failed', taskId: 'bad', error: new Error('boom'), durationMs: 3, overran: true },
      ]
    })

    await expect(main()).resolves.toBe(0)
    expect(mocks.initTracing).toHaveBeenCalledWith('meith-worker')
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ ran: ['ok'], failed: ['bad'] }),
      'tick complete',
    )
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'bad' }),
      'task failed',
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'bad' }),
      'task overran',
    )
  })

  it('logs a tick failure and shuts down', async () => {
    mocks.tick.mockImplementationOnce(async () => {
      process.emit('SIGINT')
      throw new Error('tick')
    })
    await expect(main()).resolves.toBe(0)
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'tick failed',
    )
  })

  it('forces an exit on a second signal', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    mocks.tick.mockImplementationOnce(async () => {
      process.emit('SIGTERM')
      process.emit('SIGTERM')
      return []
    })
    await main()
    expect(exit).toHaveBeenCalledWith(1)
  })
})

describe('checkReady', () => {
  it('refuses fixture mode', async () => {
    mocks.env.DATA_SOURCE = 'fixture'
    await expect(checkReady()).resolves.toBe(1)
  })

  it('reports a healthy scheduler as ready', async () => {
    await expect(checkReady()).resolves.toBe(0)
    expect(mocks.taskHealth).toHaveBeenCalled()
  })

  it('reports a stopped scheduler as unready', async () => {
    mocks.assessScheduler.mockReturnValue({
      schedulerStopped: true,
      stale: ['task'],
      failing: [],
    } as never)
    await expect(checkReady()).resolves.toBe(1)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stale: ['task'] }),
      'scheduler has stopped',
    )
  })

  it('reports database failures as unready', async () => {
    mocks.taskHealth.mockRejectedValueOnce(new Error('offline'))
    await expect(checkReady()).resolves.toBe(1)
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'readiness check could not reach the database',
    )
  })
})
