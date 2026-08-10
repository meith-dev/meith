import { describe, expect, it, vi } from 'vitest'

import { PluginHost, type HostLogger } from './host'
import { definePlugin, type PluginDefinition, type PluginHooks } from './plugin'

const VIEWER = { userId: 1, isGuest: false }

function silentLogger(): HostLogger & { warns: unknown[]; errors: unknown[] } {
  const warns: unknown[] = []
  const errors: unknown[] = []
  return {
    warns,
    errors,
    warn: (message, detail) => warns.push({ message, detail }),
    error: (message, detail) => errors.push({ message, detail }),
  }
}

function makePlugin(key: string, hooks: PluginHooks): PluginDefinition {
  return definePlugin({ key, name: key, version: '1.0.0', hooks })
}

describe('filters', () => {
  it('returns the value unchanged when nothing is listening', async () => {
    const host = new PluginHost({ plugins: [] })
    expect(await host.applyFilter('markdown.render.html', '<p>hi</p>', { ...VIEWER, source: 'post' })).toBe(
      '<p>hi</p>',
    )
  })

  it('chains: each plugin sees what the last one returned', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', { 'markdown.render.html': (value) => `${value}A` }),
        makePlugin('bravo', { 'markdown.render.html': (value) => `${value}B` }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('xAB')
  })

  it('orders by priority, then by plugin key — never by registration order', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('zulu', { 'markdown.render.html': (value) => `${value}Z` }),
        makePlugin('alpha', { 'markdown.render.html': (value) => `${value}A` }),
        makePlugin('mike', {
          'markdown.render.html': { handler: (value) => `${value}M`, priority: 10 },
        }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('xMAZ')
  })

  it('awaits an async filter', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'markdown.render.html': async (value) => Promise.resolve(`${value}!`),
        }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x!')
  })

  it('keeps the previous value when a filter throws, and runs the rest', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      logger,
      plugins: [
        makePlugin('alpha', {
          'markdown.render.html': () => {
            throw new Error('boom')
          },
        }),
        makePlugin('bravo', { 'markdown.render.html': (value) => `${value}B` }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('xB')
    expect(logger.errors).toHaveLength(1)
  })

  it('keeps the previous value when a filter rejects', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'markdown.render.html': async () => Promise.reject(new Error('boom')),
        }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x')
  })

  it('keeps the previous value when a filter returns nothing', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'markdown.render.html': (() => undefined) as never })],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x')
  })

  it('lets a filter suppress a nullable value with null', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'mail.send.before': () => null })],
    })

    expect(
      await host.applyFilter(
        'mail.send.before',
        { to: 'a@b.test', subject: 's', textBody: 't', htmlBody: null },
        { template: 'welcome' },
      ),
    ).toBeNull()
  })
})

describe('events', () => {
  it('calls every listener in order and discards their results', async () => {
    const seen: string[] = []
    const host = new PluginHost({
      plugins: [
        makePlugin('bravo', { 'post.created': () => void seen.push('bravo') }),
        makePlugin('alpha', { 'post.created': () => void seen.push('alpha') }),
      ],
    })

    await host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER)
    expect(seen).toEqual(['alpha', 'bravo'])
  })

  it('survives a listener that throws', async () => {
    const seen: string[] = []
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'post.created': () => {
            throw new Error('boom')
          },
        }),
        makePlugin('bravo', { 'post.created': () => void seen.push('bravo') }),
      ],
    })

    await expect(
      host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER),
    ).resolves.toBeUndefined()
    expect(seen).toEqual(['bravo'])
  })
})

describe('failure isolation and auto-disable', () => {
  const throwing = (key: string) =>
    makePlugin(key, {
      'post.created': () => {
        throw new Error('always')
      },
      'markdown.render.html': (value) => `${value}!`,
    })

  const fire = async (host: PluginHost, times: number): Promise<void> => {
    for (let i = 0; i < times; i++) {
      await host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER)
    }
  }

  it('switches a plugin off after the threshold, and says why', async () => {
    const host = new PluginHost({ plugins: [throwing('alpha')], failureThreshold: 3 })

    await fire(host, 2)
    expect(host.health()[0]?.enabled).toBe(true)

    await fire(host, 1)
    const health = host.health()[0]
    expect(health?.enabled).toBe(false)
    expect(health?.disabledReason).toMatch(/3 failures/)
    expect(health?.lastError).toEqual({ hook: 'post.created', message: 'always' })
  })

  it('stops calling the plugin’s other hooks once it is disabled', async () => {
    const host = new PluginHost({ plugins: [throwing('alpha')], failureThreshold: 2 })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x!')
    await fire(host, 2)
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x')
  })

  it('leaves a healthy plugin running when another one is disabled', async () => {
    const host = new PluginHost({
      plugins: [throwing('alpha'), makePlugin('bravo', { 'markdown.render.html': (v) => `${v}B` })],
      failureThreshold: 1,
    })

    await fire(host, 1)
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('xB')
  })

  it('does not re-enable itself when the next call would have succeeded', async () => {
    let failing = true
    const host = new PluginHost({
      failureThreshold: 1,
      plugins: [
        makePlugin('alpha', {
          'markdown.render.html': (value) => {
            if (failing) throw new Error('transient')
            return `${value}!`
          },
        }),
      ],
    })

    await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })
    failing = false
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x')
  })

  it('an operator disabling a plugin reaches the same state', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'markdown.render.html': (v) => `${v}!` })],
    })

    host.disable('alpha', 'operator')
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe('x')
    expect(host.health()[0]?.disabledReason).toBe('operator')
  })
})

describe('timing', () => {
  const clockAdvancing = (stepMs: number) => {
    let t = 0
    return () => {
      const value = t
      t += stepMs
      return value
    }
  }

  it('counts calls and accumulates time per plugin', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'markdown.render.html': (v) => `${v}!` })],
      now: clockAdvancing(10),
    })

    await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })
    await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })

    const health = host.health()[0]
    expect(health?.calls).toBe(2)
    expect(health?.totalMs).toBe(20)
  })

  it('records and logs a slow call', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      logger,
      plugins: [makePlugin('alpha', { 'markdown.render.html': (v) => `${v}!` })],
      now: clockAdvancing(500),
      slowCallMs: 100,
    })

    await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })
    expect(host.health()[0]?.slowCalls).toBe(1)
    expect(logger.warns).toHaveLength(1)
  })

  it('times a failing call too', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'post.created': () => {
            throw new Error('slow and broken')
          },
        }),
      ],
      now: clockAdvancing(200),
      failureThreshold: 99,
    })

    await host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER)
    const health = host.health()[0]
    expect(health?.totalMs).toBe(200)
    expect(health?.failures).toBe(1)
  })
})

describe('UI regions', () => {
  const context = {
    region: 'postbit.footer' as const,
    viewer: VIEWER,
    subjectId: 42,
    authorId: 7,
  }

  it('collects contributions in priority then key order', () => {
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'zulu',
          name: 'Z',
          version: '1.0.0',
          contributions: [{ region: 'postbit.footer', render: () => 'Z' }],
        }),
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [{ region: 'postbit.footer', priority: 10, render: () => 'A' }],
        }),
      ],
    })

    expect(host.renderRegion('postbit.footer', context).map((entry) => entry.node)).toEqual(['A', 'Z'])
  })

  it('drops a contribution that throws while building its node', () => {
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'postbit.footer',
              render: () => {
                throw new Error('boom')
              },
            },
          ],
        }),
        definePlugin({
          key: 'bravo',
          name: 'B',
          version: '1.0.0',
          contributions: [{ region: 'postbit.footer', render: () => 'B' }],
        }),
      ],
    })

    expect(host.renderRegion('postbit.footer', context).map((entry) => entry.node)).toEqual(['B'])
    expect(host.health().find((entry) => entry.key === 'alpha')?.failures).toBe(1)
  })

  it('omits a contribution that returns nothing', () => {
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [{ region: 'postbit.footer', render: () => null }],
        }),
      ],
    })

    expect(host.renderRegion('postbit.footer', context)).toEqual([])
  })

  it('renders nothing for a region nobody contributes to', () => {
    const host = new PluginHost({ plugins: [] })
    expect(host.renderRegion('admin.dashboard', { ...context, region: 'admin.dashboard' })).toEqual([])
  })
})

describe('health and introspection', () => {
  it('reports every plugin, sorted, even one that has never run', () => {
    const host = new PluginHost({
      plugins: [makePlugin('zulu', {}), makePlugin('alpha', {})],
    })

    expect(host.health().map((entry) => entry.key)).toEqual(['alpha', 'zulu'])
    expect(host.health()[0]).toMatchObject({ calls: 0, failures: 0, enabled: true })
  })

  it('lists the plugins listening on each hook', () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', { 'post.created': () => {}, 'view.post-bit': (v) => v }),
        makePlugin('bravo', { 'post.created': () => {} }),
      ],
    })

    expect(host.listeners()).toEqual({
      'post.created': ['alpha', 'bravo'],
      'view.post-bit': ['alpha'],
    })
  })

  it('never hands out a mutable reference to its counters', async () => {
    const host = new PluginHost({ plugins: [makePlugin('alpha', { 'post.created': () => {} })] })
    const first = host.health()[0]!
    ;(first as { calls: number }).calls = 999

    await host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER)
    expect(host.health()[0]?.calls).toBe(1)
  })
})

describe('the logger', () => {
  it('is optional, and a host without one still isolates', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'post.created': () => {
            throw new Error('boom')
          },
        }),
      ],
    })

    await expect(
      host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER),
    ).resolves.toBeUndefined()
  })

  it('names the plugin and the hook in the failure it logs', async () => {
    const error = vi.fn()
    const host = new PluginHost({
      logger: { warn: vi.fn(), error },
      plugins: [
        makePlugin('alpha', {
          'post.created': () => {
            throw new Error('boom')
          },
        }),
      ],
    })

    await host.emit('post.created', { postId: 1, threadId: 2, forumId: 3, authorId: 4 }, VIEWER)
    expect(error).toHaveBeenCalledWith('plugin hook failed', {
      plugin: 'alpha',
      hook: 'post.created',
      message: 'boom',
    })
  })
})
