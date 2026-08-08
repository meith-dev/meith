/**
 * F02 — where the environment comes from.
 *
 * These write real files and mutate the real `process.env`, because that is the
 * whole behaviour: `process.loadEnvFile` is Node's, and a test that stubbed it
 * would be asserting the shape of this module's own calls rather than the
 * precedence an operator actually gets. Every variable is named per test and
 * deleted afterwards — precedence here is "first write wins", so a name leaked
 * from one test would silently decide the next one's answer.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { findWorkspaceRoot, loadEnvFiles } from './env-files'

const created: string[] = []
const touched: string[] = []

/** A throwaway workspace root: a directory with the marker file in it. */
function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'community-env-'))
  created.push(root)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, name), contents)
  }
  return root
}

/** A directory with no workspace above it. */
function orphanDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'community-noworkspace-'))
  created.push(dir)
  return dir
}

/** Registers a variable for cleanup and returns its name. */
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
    const deep = join(root, 'apps', 'community')
    mkdirSync(deep, { recursive: true })

    expect(findWorkspaceRoot(deep)).toBe(root)
    // Inclusive of the starting directory: the CLI is often run from the root.
    expect(findWorkspaceRoot(root)).toBe(root)
  })

  it('gives up rather than guessing when there is no workspace above', () => {
    expect(findWorkspaceRoot(orphanDir())).toBeUndefined()
  })
})

describe('loadEnvFiles', () => {
  it('loads .env from the workspace root when started from a nested app', () => {
    const name = owned('COMMUNITY_TEST_FROM_ROOT')
    const root = workspace({ '.env': `${name}=from-dot-env\n` })
    const deep = join(root, 'apps', 'cli')
    mkdirSync(deep, { recursive: true })

    /* The case that motivated the module: `pnpm --filter @meith/cli start` runs
       with a cwd two levels below the file it needs. */
    expect(loadEnvFiles(deep)).toEqual({ root, loaded: ['.env'] })
    expect(process.env[name]).toBe('from-dot-env')
  })

  it('prefers .env.local over .env', () => {
    const name = owned('COMMUNITY_TEST_PRECEDENCE')
    const root = workspace({
      '.env': `${name}=from-dot-env\n`,
      '.env.local': `${name}=from-dot-env-local\n`,
    })

    expect(loadEnvFiles(root).loaded).toEqual(['.env.local', '.env'])
    expect(process.env[name]).toBe('from-dot-env-local')
  })

  it('never overwrites a variable the environment already set', () => {
    const name = owned('COMMUNITY_TEST_AMBIENT_WINS')
    process.env[name] = 'from-the-environment'
    const root = workspace({ '.env': `${name}=from-dot-env\n` })

    loadEnvFiles(root)

    /*
     * The property CI, `docker run -e` and Playwright's `webServer.env` all
     * depend on. If a file could win, the e2e suite's explicit DATABASE_URL
     * would be quietly replaced by whatever a developer keeps in `.env`, and
     * the suite would write to their board.
     */
    expect(process.env[name]).toBe('from-the-environment')
  })

  it('reports the root and loads nothing when there are no env files', () => {
    const root = workspace({})
    expect(loadEnvFiles(root)).toEqual({ root, loaded: [] })
  })

  it('is a no-op outside a workspace, which is the production case', () => {
    const orphan = orphanDir()
    // A `.env` here belongs to some other project, and is deliberately ignored.
    writeFileSync(join(orphan, '.env'), 'COMMUNITY_TEST_STRAY=nope\n')

    expect(loadEnvFiles(orphan)).toEqual({ root: undefined, loaded: [] })
    expect(process.env.COMMUNITY_TEST_STRAY).toBeUndefined()
  })
})
