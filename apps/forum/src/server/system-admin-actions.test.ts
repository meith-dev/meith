import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
const retried: string[] = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
    queue: {
      async retry(jobId: string) {
        retried.push(jobId)
      },
    },
  }),
}))

const sessionSweeps: Array<{ limit: number }> = []
const tokenSweeps: Array<{ limit: number }> = []
const recounts: number[] = []

vi.mock('./system-admin', () => ({
  requireMaintenance: () => ({
    async pruneSessions(_now: Date, limit: number) {
      sessionSweeps.push({ limit })
      return 12
    },
    async pruneExpiredTokens(_now: Date, limit: number) {
      tokenSweeps.push({ limit })
      return 3
    },
  }),
  requireRecount: () => ({
    async run(batch: number) {
      recounts.push(batch)
      return { corrected: 7 }
    },
  }),
}))

const {
  clearCacheAction,
  pruneSessionsAction,
  pruneTokensAction,
  recountAction,
  retryJobAction,
} = await import('./system-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  retried.length = 0
  sessionSweeps.length = 0
  tokenSweeps.length = 0
  recounts.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

describe('the admin gate', () => {
  it('is asked for on every maintenance action', async () => {
    await pruneSessionsAction()
    await pruneTokensAction()
    await recountAction()
    await clearCacheAction({}, form({ what: 'forums' }))
    await retryJobAction({}, form({ jobId: '42' }))

    expect(requireAdminMock).toHaveBeenCalledTimes(5)
  })

  it('does nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await pruneSessionsAction()
    expect(state.error).toBeDefined()
    expect(sessionSweeps).toEqual([])
  })
})

describe('the sweeps', () => {
  it('are bounded, and say how much they removed', async () => {
    const sessions = await pruneSessionsAction()
    expect(sessionSweeps[0]?.limit).toBeGreaterThan(0)
    expect(sessions.values?.removed).toBe('12')

    const tokens = await pruneTokensAction()
    expect(tokenSweeps[0]?.limit).toBeGreaterThan(0)
    expect(tokens.values?.removed).toBe('3')
  })

  it('records what was removed in the audit log', async () => {
    await pruneSessionsAction()
    expect(adminCalls[0]).toEqual({
      action: 'system.sessions_pruned',
      detail: { removed: 12 },
    })
  })
})

describe('recountAction', () => {
  it('runs one bounded batch and reports what it corrected', async () => {
    const state = await recountAction()

    expect(recounts).toHaveLength(1)
    expect(recounts[0]).toBeGreaterThan(0)
    expect(state.values?.corrected).toBe('7')
  })
})

describe('clearCacheAction', () => {
  it('clears one named tag', async () => {
    await clearCacheAction({}, form({ what: 'forums' }))
    expect(invalidated).toEqual([['forum-tree']])

    await clearCacheAction({}, form({ what: 'permissions' }))
    expect(invalidated[1]).toEqual(['permissions'])
  })

  it('refuses anything it cannot name, rather than flushing everything', async () => {
    const state = await clearCacheAction({}, form({ what: 'everything' }))

    expect(state.error).toBeDefined()
    expect(invalidated).toEqual([])
  })
})

describe('retryJobAction', () => {
  it('retries one job by id', async () => {
    const state = await retryJobAction({}, form({ jobId: 'job-9' }))

    expect(state.notice).toBe('retried')
    expect(retried).toEqual(['job-9'])
  })

  it('refuses a blank id rather than retrying something unnamed', async () => {
    const state = await retryJobAction({}, form({ jobId: '  ' }))
    expect(state.error).toBeDefined()
    expect(retried).toEqual([])
  })
})
