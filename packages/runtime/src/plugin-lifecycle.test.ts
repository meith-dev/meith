import { describe, expect, it, vi } from 'vitest'

const contexts: Array<{ component: string; plugin: string }> = []
vi.mock('./plugin-context', () => ({
  pluginRuntimeContext: async (input: { component: string; plugin: { key: string } }) => {
    contexts.push({ component: input.component, plugin: input.plugin.key })
    return { settings: {}, logger: { info: () => {}, warn: () => {}, error: () => {} } }
  },
}))

const { runPluginLifecycle } = await import('./plugin-lifecycle')

const db = {} as never

function plugin(over: Record<string, unknown> = {}) {
  return { key: 'dues', name: 'Dues', version: '1.0.0', ...over } as never
}

describe('runPluginLifecycle', () => {
  it('says nothing ran when the plugin declares no callback', async () => {
    expect(await runPluginLifecycle({ db, plugin: plugin(), phase: 'install' })).toEqual({
      ran: false,
    })
  })

  it('runs the callback for the phase, and only that one', async () => {
    const called: string[] = []

    await runPluginLifecycle({
      db,
      plugin: plugin({
        onInstall: () => void called.push('install'),
        onEnable: () => void called.push('enable'),
      }),
      phase: 'enable',
    })

    expect(called).toEqual(['enable'])
  })

  it('hands the callback a context that says which phase it is', async () => {
    contexts.length = 0

    await runPluginLifecycle({ db, plugin: plugin({ onDisable: () => {} }), phase: 'disable' })

    expect(contexts).toEqual([{ component: 'plugin-disable', plugin: 'dues' }])
  })

  it('awaits a callback that returns a promise', async () => {
    let finished = false

    await runPluginLifecycle({
      db,
      plugin: plugin({
        onInstall: async () => {
          await Promise.resolve()
          finished = true
        },
      }),
      phase: 'install',
    })

    expect(finished).toBe(true)
  })

  it('throws what the callback threw, so the caller decides the policy', async () => {
    await expect(
      runPluginLifecycle({
        db,
        plugin: plugin({
          onInstall: () => {
            throw new Error('no schema')
          },
        }),
        phase: 'install',
      }),
    ).rejects.toThrow('no schema')
  })
})
