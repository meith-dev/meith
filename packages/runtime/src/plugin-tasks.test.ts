/**
 * F69 — plugin tasks in F06's registry.
 *
 * Three claims, and each one is a way the adapter could be quietly wrong:
 * the id has to be the namespaced one (a plugin that could pick `relay-outbox`
 * would replace it), settings have to be read per run rather than captured
 * (otherwise the panel's save takes effect on the next deploy), and a throw has
 * to propagate (swallowing it turns every failure into a successful run of
 * nothing, which is what the system-health screen exists to make visible).
 */
import { describe, expect, it, vi } from 'vitest'

import { definePlugin } from '@meith/plugin-kit'

const stored = { current: new Map<string, string>() }

vi.mock('@meith/core', () => ({
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}))

vi.mock('@meith/db', () => ({
  PostgresSettingsRepository: class {
    async loadAll() {
      return stored.current
    }
  },
}))

const { pluginTasks } = await import('./plugin-tasks')

const CONTEXT = {
  now: new Date(),
  lastRunAt: null,
  elapsedSeconds: 0,
  signal: new AbortController().signal,
}

/* The adapter never touches the client; it only hands it to the repository. */
const db = {} as never

describe('registration', () => {
  it('registers nothing for a plugin that declares no tasks', () => {
    const plugin = definePlugin({ key: 'alpha', name: 'Alpha', version: '1.0.0' })
    expect(pluginTasks({ db, plugins: [plugin] })).toEqual([])
  })

  it('namespaces the id, so a plugin cannot displace a core task', () => {
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      /*
       * The id a plugin would have to choose to collide with F06's outbox
       * relay. It comes out namespaced, so it cannot.
       */
      tasks: [{ id: 'relay-outbox', intervalSeconds: 300, run: () => {} }],
    })

    const [task] = pluginTasks({ db, plugins: [plugin] })
    expect(task?.id).toBe('plugin.alpha.relay-outbox')
    expect(task?.intervalSeconds).toBe(300)
  })

  it('names the plugin in the description, which a plugin does not get to write', () => {
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      tasks: [{ id: 'sweep', intervalSeconds: 600, run: () => {} }],
    })

    expect(pluginTasks({ db, plugins: [plugin] })[0]?.description).toContain('alpha')
  })
})

describe('running one', () => {
  it('hands the plugin its resolved settings', async () => {
    let seen: unknown = null
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      settings: [{ key: 'batch', label: 'Batch', default: 10 }],
      tasks: [
        {
          id: 'sweep',
          intervalSeconds: 300,
          run: (context) => {
            seen = context.settings
          },
        },
      ],
    })

    stored.current = new Map([['plugin.alpha.batch', '50']])
    await pluginTasks({ db, plugins: [plugin] })[0]?.run(CONTEXT)

    expect(seen).toEqual({ batch: 50 })
  })

  /*
   * The bundle is built once per process and a task can run for weeks after
   * that. Reading at registration would mean the panel's save applies on the
   * next deploy rather than on the next tick.
   */
  it('re-reads settings on every run rather than capturing them', async () => {
    const seen: unknown[] = []
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      settings: [{ key: 'batch', label: 'Batch', default: 10 }],
      tasks: [
        {
          id: 'sweep',
          intervalSeconds: 300,
          run: (context) => {
            seen.push(context.settings.batch)
          },
        },
      ],
    })

    stored.current = new Map([['plugin.alpha.batch', '10']])
    const [task] = pluginTasks({ db, plugins: [plugin] })

    await task?.run(CONTEXT)
    stored.current = new Map([['plugin.alpha.batch', '99']])
    await task?.run(CONTEXT)

    expect(seen).toEqual([10, 99])
  })

  it('lets a failure through, so the scheduler records and reports it', async () => {
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      tasks: [
        {
          id: 'sweep',
          intervalSeconds: 300,
          run: () => {
            throw new Error('the remote is down')
          },
        },
      ],
    })

    stored.current = new Map()
    await expect(pluginTasks({ db, plugins: [plugin] })[0]?.run(CONTEXT)).rejects.toThrow(
      'the remote is down',
    )
  })

  it('reports no counters, because a plugin task returns none', async () => {
    const plugin = definePlugin({
      key: 'alpha',
      name: 'Alpha',
      version: '1.0.0',
      tasks: [{ id: 'sweep', intervalSeconds: 300, run: () => {} }],
    })

    stored.current = new Map()
    expect(await pluginTasks({ db, plugins: [plugin] })[0]?.run(CONTEXT)).toEqual({})
  })
})
