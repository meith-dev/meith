import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execCalls: { command: string; args: readonly string[]; cwd: unknown }[] = []
const failure = { current: false }

vi.mock('node:child_process', () => ({
  execFileSync: (command: string, args: readonly string[], options: { cwd?: string }) => {
    execCalls.push({ command, args, cwd: options.cwd })
    if (failure.current) throw new Error('npm failed')
    return ''
  },
}))

const { installBoardPackage } = await import('./plugin-manifest')

beforeEach(() => {
  execCalls.length = 0
  failure.current = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('installBoardPackage', () => {
  it('runs npm install --save-exact for the package, in the board directory', () => {
    installBoardPackage('/srv/board', '@meith/plugin-dues')

    expect(execCalls).toHaveLength(1)
    expect(execCalls[0]?.command).toBe('npm')
    expect(execCalls[0]?.args).toEqual(['install', '--save-exact', '@meith/plugin-dues'])
    expect(execCalls[0]?.cwd).toBe('/srv/board')
  })

  it('turns an npm failure into a clear error', () => {
    failure.current = true

    expect(() => installBoardPackage('/srv/board', '@meith/plugin-dues')).toThrow(
      /Could not install @meith\/plugin-dues/,
    )
  })
})
