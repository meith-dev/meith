import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { findWorkspaceRoot, loadEnvFiles } from './env-files'

const created: string[] = []
const touched: string[] = []

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'forum-env-'))
  created.push(root)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, name), contents)
  }
  return root
}

function orphanDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forum-noworkspace-'))
  created.push(dir)
  return dir
}

function owned(name: string): string {
  touched.push(name)
  return name
}

afterEach(() => {
  for (const name of touched.splice(0)) delete process.env[name]
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('findWorkspaceRoot', () => {
  it('walks up to the directory holding pnpm-workspace.yaml', () => {
    const root = workspace({})
    const deep = join(root, 'apps', 'forum')
    mkdirSync(deep, { recursive: true })

    expect(findWorkspaceRoot(deep)).toBe(root)
    expect(findWorkspaceRoot(root)).toBe(root)
  })

  it('gives up rather than guessing when there is no workspace above', () => {
    expect(findWorkspaceRoot(orphanDir())).toBeUndefined()
  })
})

describe('loadEnvFiles', () => {
  it('loads .env from the workspace root when started from a nested app', () => {
    const name = owned('FORUM_TEST_FROM_ROOT')
    const root = workspace({ '.env': `${name}=from-dot-env\n` })
    const deep = join(root, 'apps', 'cli')
    mkdirSync(deep, { recursive: true })

    expect(loadEnvFiles(deep)).toEqual({ root, loaded: ['.env'] })
    expect(process.env[name]).toBe('from-dot-env')
  })

  it('prefers .env.local over .env', () => {
    const name = owned('FORUM_TEST_PRECEDENCE')
    const root = workspace({
      '.env': `${name}=from-dot-env\n`,
      '.env.local': `${name}=from-dot-env-local\n`,
    })

    expect(loadEnvFiles(root).loaded).toEqual(['.env.local', '.env'])
    expect(process.env[name]).toBe('from-dot-env-local')
  })

  it('never overwrites a variable the environment already set', () => {
    const name = owned('FORUM_TEST_AMBIENT_WINS')
    process.env[name] = 'from-the-environment'
    const root = workspace({ '.env': `${name}=from-dot-env\n` })

    loadEnvFiles(root)

    expect(process.env[name]).toBe('from-the-environment')
  })

  it('reports the root and loads nothing when there are no env files', () => {
    const root = workspace({})
    expect(loadEnvFiles(root)).toEqual({ root, loaded: [] })
  })

  it('is a no-op outside a workspace, which is the production case', () => {
    const orphan = orphanDir()
    writeFileSync(join(orphan, '.env'), 'FORUM_TEST_STRAY=nope\n')

    expect(loadEnvFiles(orphan)).toEqual({ root: undefined, loaded: [] })
    expect(process.env.FORUM_TEST_STRAY).toBeUndefined()
  })
})
