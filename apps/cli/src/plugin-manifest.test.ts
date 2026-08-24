import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Manifest {
  readonly plugins: readonly {
    readonly key: string
    readonly package: string
    readonly enabled?: boolean
  }[]
}

const state: { manifest: string | undefined } = { manifest: undefined }
const execCalls: string[][] = []
const generatorFailure = { current: undefined as string | undefined }

function readManifestState(): Manifest {
  return JSON.parse(state.manifest ?? '{"plugins":[]}') as Manifest
}

vi.mock('node:fs/promises', () => ({
  readFile: async (_path: string) => {
    if (state.manifest === undefined) {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return state.manifest
  },
  writeFile: async (_path: string, content: string) => {
    state.manifest = content
  },
}))

vi.mock('node:child_process', () => ({
  execFileSync: (_command: string, args: readonly string[]) => {
    execCalls.push([...args])
    if (generatorFailure.current !== undefined) {
      const error = new Error('Command failed') as NodeJS.ErrnoException & {
        stdout?: string
        stderr?: string
      }
      error.stderr = generatorFailure.current
      throw error
    }
    return ''
  },
}))

const { inferKey, pluginAdd, pluginRemove } = await import('./plugin-manifest')

const lines: string[] = []
const logSpy = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))

beforeEach(() => {
  state.manifest = '{"plugins":[]}'
  execCalls.length = 0
  generatorFailure.current = undefined
  lines.length = 0
  logSpy.mockClear()
})

describe('inferKey', () => {
  it('reads the key out of a @scope/plugin-<key> package name', () => {
    expect(inferKey('@meith/plugin-dues')).toBe('dues')
    expect(inferKey('@acme/plugin-widget')).toBe('widget')
  })

  it('cannot infer a key from a package that does not fit the shape', () => {
    expect(inferKey('@meith/dues')).toBeUndefined()
    expect(inferKey('dues')).toBeUndefined()
    expect(inferKey('plugin-dues')).toBeUndefined()
  })
})

describe('pluginAdd', () => {
  it('adds an entry, regenerates, and reports what to do next', async () => {
    expect(await pluginAdd(['@meith/plugin-dues'])).toBe(0)

    expect(readManifestState().plugins).toEqual([
      { key: 'dues', package: '@meith/plugin-dues', enabled: true },
    ])
    expect(execCalls).toHaveLength(1)
    expect(lines.join('\n')).toContain('Added "dues"')
    expect(lines.join('\n')).toContain('Rebuild and redeploy')
  })

  it('accepts an explicit --key for a package that does not fit @scope/plugin-<key>', async () => {
    expect(await pluginAdd(['@acme/dues-plugin', '--key', 'dues'])).toBe(0)

    expect(readManifestState().plugins).toEqual([
      { key: 'dues', package: '@acme/dues-plugin', enabled: true },
    ])
  })

  it('adds a disabled entry with --disabled', async () => {
    await pluginAdd(['@meith/plugin-dues', '--disabled'])

    expect(readManifestState().plugins).toEqual([
      { key: 'dues', package: '@meith/plugin-dues', enabled: false },
    ])
  })

  it('refuses a package it cannot infer a key from, without --key', async () => {
    await expect(pluginAdd(['@acme/dues-plugin'])).rejects.toThrow(/Can't infer a plugin key/)
    expect(readManifestState().plugins).toEqual([])
    expect(execCalls).toHaveLength(0)
  })

  it('refuses a key already in the manifest', async () => {
    state.manifest = JSON.stringify({
      plugins: [{ key: 'dues', package: '@meith/plugin-dues', enabled: true }],
    })

    await expect(pluginAdd(['@meith/plugin-dues'])).rejects.toThrow(
      /already in apps\/community\/board\.plugins\.json/,
    )
    expect(execCalls).toHaveLength(0)
  })

  it('refuses plugin configuration — the manifest has no field for it', async () => {
    await expect(pluginAdd(['@meith/plugin-dues', '--currency', 'gbp'])).rejects.toThrow(
      /does not take plugin configuration/,
    )
    expect(readManifestState().plugins).toEqual([])
    expect(execCalls).toHaveLength(0)
  })

  it('reports when the manifest is missing — this needs a checkout, not the deployed image', async () => {
    state.manifest = undefined

    await expect(pluginAdd(['@meith/plugin-dues'])).rejects.toThrow(/needs a checkout/)
  })

  it('rolls back the manifest when the generator refuses the result', async () => {
    generatorFailure.current = 'board.plugins.json: "@meith/plugin-dues" is not a dependency'

    await expect(pluginAdd(['@meith/plugin-dues'])).rejects.toThrow(/not a dependency/)
    expect(readManifestState().plugins).toEqual([])
  })
})

describe('pluginRemove', () => {
  beforeEach(() => {
    state.manifest = JSON.stringify({
      plugins: [{ key: 'dues', package: '@meith/plugin-dues', enabled: true }],
    })
  })

  it('removes an entry, regenerates, and reports what to do next', async () => {
    expect(await pluginRemove(['dues'])).toBe(0)

    expect(readManifestState().plugins).toEqual([])
    expect(execCalls).toHaveLength(1)
    expect(lines.join('\n')).toContain('Removed "dues"')
    expect(lines.join('\n')).toContain('Rebuild and redeploy')
  })

  it('refuses a key that is not in the manifest, and lists what is', async () => {
    await expect(pluginRemove(['ghost'])).rejects.toThrow(/Present: dues/)
    expect(execCalls).toHaveLength(0)
  })

  it('rolls back the manifest when the generator refuses the result', async () => {
    generatorFailure.current = 'something is wrong'

    await expect(pluginRemove(['dues'])).rejects.toThrow('something is wrong')
    expect(readManifestState().plugins).toEqual([
      { key: 'dues', package: '@meith/plugin-dues', enabled: true },
    ])
  })
})
