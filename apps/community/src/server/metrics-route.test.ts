import { beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'metrics-token-metrics-token-1234'

const envRef: { METRICS_ENABLED: boolean; METRICS_TOKEN: string | undefined } = {
  METRICS_ENABLED: true,
  METRICS_TOKEN: TOKEN,
}
const warnings: string[] = []
const gaugeSets: Array<{
  name: string
  value: number
  labels: Record<string, string> | undefined
}> = []

vi.mock('@meith/core', () => ({
  env: envRef,
  logger: () => ({
    warn: (message: string) => {
      warnings.push(message)
    },
    error: () => {},
  }),
  metrics: {
    gauge: (name: string) => ({
      set: (value: number, labels?: Record<string, string>) => {
        gaugeSets.push({ name, value, labels })
      },
    }),
    render: () => '# rendered\n',
  },
}))

interface FakeRepository {
  volumes(): Promise<{
    users: number
    threads: number
    posts: number
    attachments: number
    queuedJobs: number
    deadLetteredJobs: number
  }>
  activeConnections(): Promise<number>
}

const repositoryRef: { current: FakeRepository | null } = { current: null }
vi.mock('@/server/system-admin', () => ({
  systemHealthRepository: () => repositoryRef.current,
}))

const { GET } = await import('../../app/api/metrics/route')

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://board.example/api/metrics', { headers })
}

beforeEach(() => {
  envRef.METRICS_ENABLED = true
  envRef.METRICS_TOKEN = TOKEN
  repositoryRef.current = null
  warnings.length = 0
  gaugeSets.length = 0
})

describe('the metrics route', () => {
  it('is not found when METRICS_ENABLED is off, even with a valid token', async () => {
    envRef.METRICS_ENABLED = false

    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }))

    expect(response.status).toBe(404)
  })

  it('is not found for a caller presenting no token', async () => {
    const response = await GET(request())

    expect(response.status).toBe(404)
  })

  it('is not found for a caller presenting the wrong token', async () => {
    const response = await GET(request({ authorization: 'Bearer not-the-token' }))

    expect(response.status).toBe(404)
  })

  it('serves Prometheus text to a caller presenting the token as a bearer', async () => {
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await response.text()).toBe('# rendered\n')
  })

  it('accepts the dedicated header for a caller that cannot set authorization', async () => {
    const response = await GET(request({ 'x-metrics-token': TOKEN }))

    expect(response.status).toBe(200)
  })

  it('serves unauthenticated when no token is configured, and says so', async () => {
    envRef.METRICS_TOKEN = undefined

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(warnings.join('\n')).toMatch(/METRICS_TOKEN is not set/)
  })

  it('refreshes the queue-depth and connection gauges from the database before rendering', async () => {
    repositoryRef.current = {
      volumes: async () => ({
        users: 0,
        threads: 0,
        posts: 0,
        attachments: 0,
        queuedJobs: 4,
        deadLetteredJobs: 1,
      }),
      activeConnections: async () => 3,
    }

    await GET(request({ authorization: `Bearer ${TOKEN}` }))

    expect(gaugeSets).toContainEqual({
      name: 'meith_queue_jobs',
      value: 4,
      labels: { status: 'queued' },
    })
    expect(gaugeSets).toContainEqual({
      name: 'meith_queue_jobs',
      value: 1,
      labels: { status: 'dead' },
    })
    expect(gaugeSets).toContainEqual({
      name: 'meith_db_connections_active',
      value: 3,
      labels: undefined,
    })
  })

  it('still answers when the database gauges cannot be refreshed', async () => {
    repositoryRef.current = {
      volumes: async () => {
        throw new Error('connection refused')
      },
      activeConnections: async () => 0,
    }

    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }))

    expect(response.status).toBe(200)
  })

  it('does not touch the database in fixture mode', async () => {
    repositoryRef.current = null

    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }))

    expect(response.status).toBe(200)
    expect(gaugeSets).toEqual([])
  })
})
