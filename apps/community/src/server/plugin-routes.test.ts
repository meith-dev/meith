import { beforeEach, describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}
vi.mock('../../community.config', () => ({
  get default() {
    return config.current
  },
}))

const overrides = { current: new Map<string, string>() }
vi.mock('./settings', () => ({ getSettingOverrides: async () => overrides.current }))

const actor = { current: { userId: null as number | null } }
vi.mock('./context', () => ({ getActor: async () => actor.current }))

vi.mock('./board-url', () => ({ boardUrl: async () => 'https://board.example' }))

const { definePlugin } = await import('@meith/plugin-kit')
const handled: unknown[] = []

const alpha = definePlugin({
  key: 'alpha',
  name: 'Alpha',
  version: '1.0.0',
  allowedRedirectHosts: ['pay.example', '127.0.0.1'],
  routes: [
    {
      path: 'ping',
      method: 'GET',
      access: 'anonymous',
      handler: (request) => {
        handled.push(request)
        return { kind: 'json', body: { pong: true } }
      },
    },
    {
      path: 'mine',
      method: 'GET',
      access: 'member',
      handler: (request) => ({ kind: 'json', body: { userId: request.viewer.userId } }),
    },
    {
      path: 'checkout',
      method: 'POST',
      access: 'member',
      handler: (request) => {
        handled.push(request)
        return { kind: 'redirect', to: 'https://pay.example/session/1' }
      },
    },
    {
      path: 'hook/provider',
      method: 'POST',
      access: 'anonymous',
      rawBody: true,
      maxBodyBytes: 64,
      handler: (request) => {
        handled.push(request)
        return { kind: 'text', body: 'received', status: 200 }
      },
    },
    {
      path: 'escape',
      method: 'GET',
      access: 'anonymous',
      handler: () => ({ kind: 'redirect', to: 'https://evil.example/' }),
    },
    {
      path: 'local',
      method: 'GET',
      access: 'anonymous',
      handler: () => ({ kind: 'redirect', to: 'http://127.0.0.1:12111/checkout/1' }),
    },
    {
      path: 'insecure',
      method: 'GET',
      access: 'anonymous',
      handler: () => ({ kind: 'redirect', to: 'http://pay.example/checkout/1' }),
    },
  ],
})

const boom = definePlugin({
  key: 'boom',
  name: 'Boom',
  version: '1.0.0',
  routes: [
    {
      path: 'go',
      method: 'GET',
      access: 'anonymous',
      handler: () => {
        throw new Error('handler blew up')
      },
    },
  ],
})

config.current.plugins = [
  { key: 'alpha', plugin: alpha },
  { key: 'boom', plugin: boom },
]

const { dispatchPluginRoute } = await import('./plugin-routes')

function request(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Request {
  return new Request(`https://board.example${path}`, {
    ...init,
    headers: { host: 'board.example', ...init.headers },
  })
}

beforeEach(() => {
  overrides.current = new Map()
  actor.current = { userId: null }
  handled.length = 0
})

describe('resolution', () => {
  it('404s an unknown plugin and an unknown path identically', async () => {
    const missingPlugin = await dispatchPluginRoute(request('/api/plugins/ghost/ping'), 'ghost', [
      'ping',
    ])
    const missingPath = await dispatchPluginRoute(request('/api/plugins/alpha/nope'), 'alpha', [
      'nope',
    ])

    expect(missingPlugin.status).toBe(404)
    expect(missingPath.status).toBe(404)
  })

  it('404s when the operator switched the plugin off — off means gone, not broken', async () => {
    overrides.current = new Map([['plugin.alpha._enabled', '0']])
    const response = await dispatchPluginRoute(request('/api/plugins/alpha/ping'), 'alpha', [
      'ping',
    ])
    expect(response.status).toBe(404)

    overrides.current = new Map()
    const recovered = await dispatchPluginRoute(request('/api/plugins/alpha/ping'), 'alpha', [
      'ping',
    ])
    expect(recovered.status).toBe(200)
  })

  it('405s the wrong method on a path that exists', async () => {
    const response = await dispatchPluginRoute(
      request('/api/plugins/alpha/ping', { method: 'POST' }),
      'alpha',
      ['ping'],
    )
    expect(response.status).toBe(405)
  })

  it('answers with no-store on everything', async () => {
    const response = await dispatchPluginRoute(request('/api/plugins/alpha/ping'), 'alpha', [
      'ping',
    ])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('access', () => {
  it('401s a guest on a member route, and hands a member their own id', async () => {
    const asGuest = await dispatchPluginRoute(request('/api/plugins/alpha/mine'), 'alpha', [
      'mine',
    ])
    expect(asGuest.status).toBe(401)

    actor.current = { userId: 7 }
    const asMember = await dispatchPluginRoute(request('/api/plugins/alpha/mine'), 'alpha', [
      'mine',
    ])
    expect(await asMember.json()).toEqual({ userId: 7 })
  })

  it('refuses a member POST from another origin, allows the board’s own and origin-less clients', async () => {
    actor.current = { userId: 7 }

    const crossSite = await dispatchPluginRoute(
      request('/api/plugins/alpha/checkout', {
        method: 'POST',
        headers: { origin: 'https://elsewhere.example' },
      }),
      'alpha',
      ['checkout'],
    )
    expect(crossSite.status).toBe(403)

    const sameOrigin = await dispatchPluginRoute(
      request('/api/plugins/alpha/checkout', {
        method: 'POST',
        headers: { origin: 'https://board.example' },
      }),
      'alpha',
      ['checkout'],
    )
    expect(sameOrigin.status).toBe(303)

    const noOrigin = await dispatchPluginRoute(
      request('/api/plugins/alpha/checkout', { method: 'POST' }),
      'alpha',
      ['checkout'],
    )
    expect(noOrigin.status).toBe(303)
  })
})

describe('what a handler is handed', () => {
  it('query, lowercased headers, and never the cookie or authorization', async () => {
    await dispatchPluginRoute(
      request('/api/plugins/alpha/ping?a=1&a=2&b=x', {
        headers: {
          Cookie: 'session=secret',
          Authorization: 'Bearer secret',
          'X-Forum-Path': '/internal',
          'User-Agent': 'test-agent',
        },
      }),
      'alpha',
      ['ping'],
    )

    const seen = handled[0] as {
      query: Record<string, string>
      headers: Record<string, string>
      boardUrl: string
    }
    expect(seen.query).toEqual({ a: '1', b: 'x' })
    expect(seen.headers['user-agent']).toBe('test-agent')
    expect(seen.headers.cookie).toBeUndefined()
    expect(seen.headers.authorization).toBeUndefined()
    expect(seen.headers['x-forum-path']).toBeUndefined()
    expect(seen.boardUrl).toBe('https://board.example')
  })

  it('hands a rawBody route the exact bytes', async () => {
    const bytes = new Uint8Array([0, 155, 10, 65])
    await dispatchPluginRoute(
      request('/api/plugins/alpha/hook/provider', { method: 'POST', body: bytes }),
      'alpha',
      ['hook', 'provider'],
    )

    const seen = handled[0] as { rawBody: Uint8Array }
    expect([...seen.rawBody]).toEqual([0, 155, 10, 65])
  })

  it('413s a body over the route’s cap', async () => {
    const response = await dispatchPluginRoute(
      request('/api/plugins/alpha/hook/provider', {
        method: 'POST',
        body: 'x'.repeat(65),
      }),
      'alpha',
      ['hook', 'provider'],
    )
    expect(response.status).toBe(413)
    expect(handled).toHaveLength(0)
  })

  it('parses a same-origin form for a plain POST route', async () => {
    actor.current = { userId: 7 }
    await dispatchPluginRoute(
      request('/api/plugins/alpha/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'plan=supporter&period=month',
      }),
      'alpha',
      ['checkout'],
    )

    const seen = handled[0] as { form: Record<string, string>; rawBody: null }
    expect(seen.form).toEqual({ plan: 'supporter', period: 'month' })
    expect(seen.rawBody).toBeNull()
  })
})

describe('what a handler may answer', () => {
  it('follows an allowed absolute redirect with 303 after a POST', async () => {
    actor.current = { userId: 7 }
    const response = await dispatchPluginRoute(
      request('/api/plugins/alpha/checkout', { method: 'POST' }),
      'alpha',
      ['checkout'],
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://pay.example/session/1')
  })

  it('refuses a redirect to a host the plugin did not declare', async () => {
    const response = await dispatchPluginRoute(request('/api/plugins/alpha/escape'), 'alpha', [
      'escape',
    ])
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('redirect_refused')
  })

  it('allows plain http only to a declared loopback host — the test-double shape', async () => {
    const local = await dispatchPluginRoute(request('/api/plugins/alpha/local'), 'alpha', [
      'local',
    ])
    expect(local.status).toBe(307)
    expect(local.headers.get('location')).toBe('http://127.0.0.1:12111/checkout/1')

    const insecure = await dispatchPluginRoute(
      request('/api/plugins/alpha/insecure'),
      'alpha',
      ['insecure'],
    )
    expect(insecure.status).toBe(502)
  })
})

describe('failure', () => {
  it('500s a throwing handler without letting the error escape', async () => {
    const response = await dispatchPluginRoute(request('/api/plugins/boom/go'), 'boom', ['go'])
    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('plugin_failed')
  })
})
