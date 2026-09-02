import { describe, expect, it, vi } from 'vitest'

import { sourceTranslator } from '@meith/i18n'

import { type HostLogger, PluginHost } from './host'
import { definePlugin, type PluginDefinition, type PluginHooks } from './plugin'
import { unavailablePluginRuntime } from './runtime'

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
    expect(
      await host.applyFilter('markdown.render.html', '<p>hi</p>', { ...VIEWER, source: 'post' }),
    ).toBe('<p>hi</p>')
  })

  it('chains: each plugin sees what the last one returned', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', { 'markdown.render.html': (value) => `${value}A` }),
        makePlugin('bravo', { 'markdown.render.html': (value) => `${value}B` }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'xAB',
    )
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

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'xMAZ',
    )
  })

  it('awaits an async filter', async () => {
    const host = new PluginHost({
      plugins: [
        makePlugin('alpha', {
          'markdown.render.html': async (value) => Promise.resolve(`${value}!`),
        }),
      ],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x!',
    )
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

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'xB',
    )
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

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
  })

  it('keeps the previous value when a filter returns nothing', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'markdown.render.html': (() => undefined) as never })],
    })

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
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

    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x!',
    )
    await fire(host, 2)
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
  })

  it('leaves a healthy plugin running when another one is disabled', async () => {
    const host = new PluginHost({
      plugins: [throwing('alpha'), makePlugin('bravo', { 'markdown.render.html': (v) => `${v}B` })],
      failureThreshold: 1,
    })

    await fire(host, 1)
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'xB',
    )
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
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
  })

  it('an operator disabling a plugin reaches the same state', async () => {
    const host = new PluginHost({
      plugins: [makePlugin('alpha', { 'markdown.render.html': (v) => `${v}!` })],
    })

    host.disable('alpha', 'operator')
    expect(await host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })).toBe(
      'x',
    )
    expect(host.health()[0]?.disabledReason).toBe('operator')
  })

  it('reports every failure to the health sink, so a durable count can be kept', async () => {
    const seen: { pluginKey: string; hook: string; threshold: number }[] = []
    const host = new PluginHost({
      plugins: [throwing('alpha')],
      failureThreshold: 3,
      health: {
        failed: ({ pluginKey, hook, threshold }) => seen.push({ pluginKey, hook, threshold }),
      },
    })

    await fire(host, 2)

    expect(seen).toEqual([
      { pluginKey: 'alpha', hook: 'post.created', threshold: 3 },
      { pluginKey: 'alpha', hook: 'post.created', threshold: 3 },
    ])
  })
})

describe('the durable record', () => {
  const filtering = (key: string) =>
    makePlugin(key, { 'markdown.render.html': (value: string) => `${value}!` })

  const render = (host: PluginHost) =>
    host.applyFilter('markdown.render.html', 'x', { ...VIEWER, source: 'post' })

  it('switches a plugin off that another instance disabled', async () => {
    const host = new PluginHost({ plugins: [filtering('alpha')] })

    host.setDurablyDisabled([{ key: 'alpha', reason: '5 failures elsewhere' }])

    expect(await render(host)).toBe('x')
    expect(host.health()[0]).toMatchObject({
      enabled: false,
      durablyDisabled: true,
      disabledReason: '5 failures elsewhere',
    })
  })

  it('brings one back when an operator clears the record, without a restart', async () => {
    const host = new PluginHost({ plugins: [filtering('alpha')] })

    host.setDurablyDisabled([{ key: 'alpha', reason: 'failures' }])
    host.setDurablyDisabled([])

    expect(await render(host)).toBe('x!')
    expect(host.health()[0]).toMatchObject({ enabled: true, durablyDisabled: false })
  })

  it('leaves a plugin nobody disabled alone', async () => {
    const host = new PluginHost({ plugins: [filtering('alpha'), filtering('bravo')] })

    host.setDurablyDisabled([{ key: 'bravo', reason: 'failures' }])

    expect(await render(host)).toBe('x!')
  })

  it('does not undo an operator switch it knows nothing about', async () => {
    const host = new PluginHost({ plugins: [filtering('alpha')] })

    host.setOperatorDisabled(['alpha'])
    host.setDurablyDisabled([])

    expect(await render(host)).toBe('x')
    expect(host.health()[0]).toMatchObject({ enabled: false, operatorDisabled: true })
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
    locale: 'en',
    t: sourceTranslator({}),
  }

  it('collects contributions in priority then key order', async () => {
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

    expect((await host.renderRegion('postbit.footer', context)).map((entry) => entry.node)).toEqual(
      ['A', 'Z'],
    )
  })

  it('drops a contribution that throws while building its node', async () => {
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

    expect((await host.renderRegion('postbit.footer', context)).map((entry) => entry.node)).toEqual(
      ['B'],
    )
    expect(host.health().find((entry) => entry.key === 'alpha')?.failures).toBe(1)
  })

  it('omits a contribution that returns nothing', async () => {
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

    expect(await host.renderRegion('postbit.footer', context)).toEqual([])
  })

  it('renders nothing for a region nobody contributes to', async () => {
    const host = new PluginHost({ plugins: [] })
    expect(
      await host.renderRegion('admin.dashboard', { ...context, region: 'admin.dashboard' }),
    ).toEqual([])
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

describe('run — plugin code on a non-hook surface', () => {
  it('returns the value and counts the call', async () => {
    const host = new PluginHost({ plugins: [makePlugin('alpha', {})] })

    const outcome = await host.run('alpha', 'route GET ping', () => 'pong')
    expect(outcome).toEqual({ status: 'ok', value: 'pong' })
    expect(host.health().find((entry) => entry.key === 'alpha')?.calls).toBe(1)
  })

  it('reports failed, records the error against the plugin, and eventually auto-disables', async () => {
    const host = new PluginHost({ plugins: [makePlugin('alpha', {})], failureThreshold: 2 })

    const boom = () => {
      throw new Error('handler blew up')
    }
    expect(await host.run('alpha', 'route POST checkout', boom)).toEqual({ status: 'failed' })

    const health = host.health().find((entry) => entry.key === 'alpha')
    expect(health?.failures).toBe(1)
    expect(health?.lastError).toEqual({ hook: 'route POST checkout', message: 'handler blew up' })

    await host.run('alpha', 'route POST checkout', boom)
    expect(await host.run('alpha', 'route POST checkout', () => 'fine')).toEqual({
      status: 'disabled',
    })
  })

  it('reports disabled for an unknown plugin and for an operator-disabled one', async () => {
    const host = new PluginHost({ plugins: [makePlugin('alpha', {})] })

    expect(await host.run('ghost', 'route GET ping', () => 'x')).toEqual({ status: 'disabled' })

    host.setOperatorDisabled(['alpha'])
    expect(host.isEnabled('alpha')).toBe(false)
    expect(await host.run('alpha', 'route GET ping', () => 'x')).toEqual({ status: 'disabled' })

    host.setOperatorDisabled([])
    expect(host.isEnabled('alpha')).toBe(true)
  })
})

describe('the runtime a hook handler can ask for', () => {
  const POST = { postId: 1, threadId: 2, forumId: 3, authorId: 4 }

  function runtimeFor(pluginKey: string) {
    return Promise.resolve({
      ...unavailablePluginRuntime('a test'),
      settings: { who: pluginKey },
    })
  }

  it('hands each plugin its own runtime, resolved only when asked for', async () => {
    const provider = vi.fn(runtimeFor)
    let seen: unknown = null

    const host = new PluginHost({
      plugins: [
        makePlugin('alfa', {
          'post.created': async (_value, _context, runtime) => {
            seen = (await runtime()).settings
          },
        }),
      ],
      runtime: provider,
    })

    await host.emit('post.created', POST, VIEWER)

    expect(seen).toEqual({ who: 'alfa' })
    expect(provider).toHaveBeenCalledExactlyOnceWith('alfa')
  })

  it('never builds one for a handler that does not ask', async () => {
    const provider = vi.fn(runtimeFor)

    const host = new PluginHost({
      plugins: [makePlugin('alfa', { 'post.created': () => {} })],
      runtime: provider,
    })

    await host.emit('post.created', POST, VIEWER)

    expect(provider).not.toHaveBeenCalled()
  })

  it('builds one per call, however many times a handler asks within it', async () => {
    const provider = vi.fn(runtimeFor)

    const host = new PluginHost({
      plugins: [
        makePlugin('alfa', {
          'post.created': async (_value, _context, runtime) => {
            await runtime()
            await runtime()
          },
        }),
      ],
      runtime: provider,
    })

    await host.emit('post.created', POST, VIEWER)
    await host.emit('post.created', POST, VIEWER)

    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('is available to a filter too, and its failure is contained like any other', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      plugins: [
        makePlugin('alfa', {
          'view.footer': async (footer, _context, runtime) => ({
            ...footer,
            boardTitle: String((await runtime()).settings.who),
          }),
        }),
      ],
      runtime: runtimeFor,
      logger,
    })

    const filtered = await host.applyFilter(
      'view.footer',
      { boardTitle: 'before', links: [], timezoneLabel: 'UTC' },
      { ...VIEWER, requestId: null },
    )

    expect(filtered.boardTitle).toBe('alfa')
  })

  it('refuses with a clear message when the host was built without a provider', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      plugins: [
        makePlugin('alfa', {
          'post.created': async (_value, _context, runtime) => {
            await runtime()
          },
        }),
      ],
      logger,
    })

    await host.emit('post.created', POST, VIEWER)

    expect(host.health()[0]?.failures).toBe(1)
    expect(JSON.stringify(logger.errors)).toContain('without a runtime provider')
  })
})

describe('what a region contribution can reach', () => {
  const context = {
    region: 'thread.header' as const,
    viewer: VIEWER,
    subjectId: 42,
    authorId: 7,
    locale: 'en',
    t: sourceTranslator({}),
  }

  it('awaits a contribution that renders asynchronously', async () => {
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'thread.header',
              render: async () => {
                await Promise.resolve()
                return 'late'
              },
            },
          ],
        }),
      ],
    })

    expect((await host.renderRegion('thread.header', context)).map((entry) => entry.node)).toEqual([
      'late',
    ])
  })

  it('hands it the same lazily-built runtime a hook handler gets', async () => {
    const provider = vi.fn(async (pluginKey: string) =>
      Promise.resolve({
        ...unavailablePluginRuntime('a test'),
        settings: { who: pluginKey },
      }),
    )

    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'thread.header',
              render: async (regionContext) => String((await regionContext.runtime()).settings.who),
            },
          ],
        }),
      ],
      runtime: provider,
    })

    expect((await host.renderRegion('thread.header', context)).map((entry) => entry.node)).toEqual([
      'alpha',
    ])
    expect(provider).toHaveBeenCalledExactlyOnceWith('alpha')
  })

  it('contains a rejection the same way it contains a throw', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'thread.header',
              render: async () => {
                throw new Error('boom')
              },
            },
          ],
        }),
        definePlugin({
          key: 'bravo',
          name: 'B',
          version: '1.0.0',
          contributions: [{ region: 'thread.header', render: () => 'B' }],
        }),
      ],
      logger,
    })

    expect((await host.renderRegion('thread.header', context)).map((entry) => entry.node)).toEqual([
      'B',
    ])
    expect(host.health().find((entry) => entry.key === 'alpha')?.failures).toBe(1)
  })

  it('never builds a runtime for a contribution that does not ask', async () => {
    const provider = vi.fn(async () => unavailablePluginRuntime('a test'))

    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [{ region: 'thread.header', render: () => 'plain' }],
        }),
      ],
      runtime: provider,
    })

    await host.renderRegion('thread.header', context)
    expect(provider).not.toHaveBeenCalled()
  })
})

describe('thread-row badges — the batch region', () => {
  const context = {
    viewer: VIEWER,
    threads: [
      { threadId: 10, authorId: 1 },
      { threadId: 20, authorId: 2 },
    ],
    locale: 'en',
    t: sourceTranslator({}),
  }

  const badgePlugin = (key: string, mark: string) =>
    definePlugin({
      key,
      name: key,
      version: '1.0.0',
      contributions: [
        {
          region: 'threadrow.badges',
          render: (ctx) =>
            new Map(ctx.threads.map((thread) => [thread.threadId, `${mark}${thread.threadId}`])),
        },
      ],
    })

  it('invokes each contribution once for the whole page, not once per row', async () => {
    let calls = 0
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'threadrow.badges',
              render: (ctx) => {
                calls += 1
                return new Map(
                  ctx.threads.map((thread) => [thread.threadId, `A${thread.threadId}`]),
                )
              },
            },
          ],
        }),
      ],
    })

    const badges = await host.renderThreadRowBadges({
      viewer: VIEWER,
      threads: [
        { threadId: 10, authorId: 1 },
        { threadId: 20, authorId: 2 },
        { threadId: 30, authorId: 3 },
      ],
      locale: 'en',
      t: sourceTranslator({}),
    })

    expect(calls).toBe(1)
    expect([...badges.keys()].sort((a, b) => a - b)).toEqual([10, 20, 30])
    expect(badges.get(10)?.map((entry) => entry.node)).toEqual(['A10'])
  })

  it('keys each plugin’s badges by thread id, composing per thread in priority then key order', async () => {
    const host = new PluginHost({
      plugins: [
        badgePlugin('zulu', 'Z'),
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'threadrow.badges',
              priority: 10,
              render: (ctx) =>
                new Map(
                  ctx.threads
                    .filter((thread) => thread.threadId === 10)
                    .map((thread) => [thread.threadId, `A${thread.threadId}`]),
                ),
            },
          ],
        }),
      ],
    })

    const badges = await host.renderThreadRowBadges(context)
    expect(badges.get(10)?.map((entry) => entry.node)).toEqual(['A10', 'Z10'])
    expect(badges.get(20)?.map((entry) => entry.node)).toEqual(['Z20'])
  })

  it('contains one plugin that throws and keeps the other’s badges', async () => {
    const logger = silentLogger()
    const host = new PluginHost({
      logger,
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'threadrow.badges',
              render: () => {
                throw new Error('boom')
              },
            },
          ],
        }),
        badgePlugin('bravo', 'B'),
      ],
    })

    const badges = await host.renderThreadRowBadges(context)
    expect(badges.get(10)?.map((entry) => entry.node)).toEqual(['B10'])
    expect(host.health().find((entry) => entry.key === 'alpha')?.failures).toBe(1)
  })

  it('omits a thread a plugin returned nothing for', async () => {
    const host = new PluginHost({
      plugins: [
        definePlugin({
          key: 'alpha',
          name: 'A',
          version: '1.0.0',
          contributions: [
            {
              region: 'threadrow.badges',
              render: () =>
                new Map([
                  [10, 'A10'],
                  [20, null],
                ]),
            },
          ],
        }),
      ],
    })

    const badges = await host.renderThreadRowBadges(context)
    expect(badges.has(10)).toBe(true)
    expect(badges.has(20)).toBe(false)
  })

  it('keeps the batch region out of renderRegion entirely', async () => {
    const host = new PluginHost({ plugins: [badgePlugin('alpha', 'A')] })

    expect(
      await host.renderRegion('threadrow.badges', {
        region: 'threadrow.badges',
        viewer: VIEWER,
        subjectId: null,
        authorId: null,
        locale: 'en',
        t: sourceTranslator({}),
      }),
    ).toEqual([])
  })

  it('never builds a runtime for a batch contribution that does not ask', async () => {
    const provider = vi.fn(async () => unavailablePluginRuntime('a test'))
    const host = new PluginHost({ plugins: [badgePlugin('alpha', 'A')], runtime: provider })

    await host.renderThreadRowBadges(context)
    expect(provider).not.toHaveBeenCalled()
  })
})
