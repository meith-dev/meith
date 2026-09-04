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
  tasks: [{ id: 'one' }] as { id: string; lane?: 'long' }[],
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
  buildSchedulerBundle: () => ({ tasks: mocks.tasks, repository: {}, onTaskFailure: vi.fn() }),
}))
vi.mock('@meith/tasks', () => ({ assessScheduler: mocks.assessScheduler, tick: mocks.tick }))

import {
  checkReady,
  LONG_LANE_STALE_CLAIM_SECONDS,
  LONG_LANE_TIMEOUT_MS,
  main,
  sleep,
  splitLanes,
  TICK_TIMEOUT_MS,
} from './lifecycle'

beforeEach(() => {
  mocks.env.DATA_SOURCE = 'postgres'
  mocks.tasks = [{ id: 'one' }]
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

  it('runs long tasks in their own lane with the backup lease as the stale claim', async () => {
    mocks.tasks = [{ id: 'quick' }, { id: 'slow', lane: 'long' }]
    const seen: { tasks: readonly { id: string }[]; staleClaimSeconds?: number }[] = []
    mocks.tick.mockImplementation(async (input: (typeof seen)[number]) => {
      seen.push(input)
      if (seen.length === 2) process.emit('SIGTERM')
      return []
    })

    await expect(main()).resolves.toBe(0)
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ lanes: ['tick', 'long'] }),
      'worker started',
    )
    const long = seen.find((input) => input.tasks[0]?.id === 'slow')
    const quick = seen.find((input) => input.tasks[0]?.id === 'quick')
    expect(long?.staleClaimSeconds).toBe(LONG_LANE_STALE_CLAIM_SECONDS)
    expect(quick).not.toHaveProperty('staleClaimSeconds')
  })

  it('warns when a tick outlives its lane, then stops', async () => {
    vi.useFakeTimers()
    try {
      mocks.tick.mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(TICK_TIMEOUT_MS + 1)
        process.emit('SIGTERM')
        return []
      })
      await expect(main()).resolves.toBe(0)
      expect(mocks.warn).toHaveBeenCalledWith(
        expect.objectContaining({ lane: 'tick', timeoutMs: TICK_TIMEOUT_MS }),
        'tick overran',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('cuts the pause between ticks short when a signal arrives', async () => {
    mocks.tick.mockResolvedValue([])
    const startedAt = Date.now()
    setTimeout(() => process.emit('SIGTERM'), 300)
    await expect(main()).resolves.toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(5_000)
    expect(mocks.tick).toHaveBeenCalledOnce()
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

describe('splitLanes', () => {
  it('keeps every task in the tick lane until one asks for the long lane', () => {
    expect(splitLanes([{ id: 'a' }, { id: 'b' }] as never)).toEqual([
      { name: 'tick', tasks: [{ id: 'a' }, { id: 'b' }], timeoutMs: TICK_TIMEOUT_MS },
    ])
    expect(splitLanes([{ id: 'a' }, { id: 'slow', lane: 'long' }] as never)).toEqual([
      { name: 'tick', tasks: [{ id: 'a' }], timeoutMs: TICK_TIMEOUT_MS },
      {
        name: 'long',
        tasks: [{ id: 'slow', lane: 'long' }],
        timeoutMs: LONG_LANE_TIMEOUT_MS,
        staleClaimSeconds: LONG_LANE_STALE_CLAIM_SECONDS,
      },
    ])
  })
})

describe('sleep', () => {
  it('resolves once the time has passed', async () => {
    const startedAt = Date.now()
    await sleep(20)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15)
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
