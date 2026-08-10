import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { migrationFolderCandidates } from './migrate'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('where the migrations are looked for', () => {
  it('tries MIGRATIONS_DIR and nothing else when it is set', () => {
    expect(
      migrationFolderCandidates({ explicit: '/srv/sql', moduleDir: HERE, cwd: '/app' }),
    ).toEqual(['/srv/sql'])
  })

  it('prefers the folder beside this module, where a checkout has it', () => {
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: '/somewhere/else' })
    expect(first).toBe(path.resolve(HERE, '..', 'migrations'))
  })

  it('finds this repository’s own migrations that way', () => {
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: HERE })
    expect(existsSync(path.join(first ?? '', 'meta', '_journal.json'))).toBe(true)
  })

  it('looks where the image puts it, for the runtimes with no module directory', () => {
    expect(migrationFolderCandidates({ cwd: '/app' })).toContain('/app/migrations')
  })

  it('walks up from the working directory, in both shapes', () => {
    const candidates = migrationFolderCandidates({ cwd: '/repo/apps/community' })

    expect(candidates).toContain(path.join('/repo', 'packages', 'db', 'migrations'))
    expect(candidates).toContain(path.join('/repo/apps/community', 'migrations'))
  })

  it('stops at the root rather than looping', () => {
    const candidates = migrationFolderCandidates({ cwd: '/' })
    expect(candidates.length).toBeLessThan(10)
    expect(candidates).toContain(path.join('/', 'migrations'))
  })

  it('puts the nearest directory first, so a checkout never reaches the image path', () => {
    const candidates = migrationFolderCandidates({ moduleDir: HERE, cwd: '/repo/apps/community' })
    expect(candidates.indexOf(path.resolve(HERE, '..', 'migrations'))).toBe(0)
  })
})
