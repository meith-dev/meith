/**
 * F03/F83 — finding the generated SQL, which is not the one-liner it looks like.
 *
 * `runMigrations()` is called by four programs standing in four different
 * places, and the one that broke is the installer: inside the Next standalone
 * server `@meith/db` has been compiled into a chunk under `.next/server`, so
 * resolving the folder relative to this module lands somewhere that has never
 * existed. The operator saw drizzle's answer to a missing folder — "Can't find
 * meta/_journal.json file" — from the page whose whole job is explaining what is
 * wrong.
 *
 * The ordering is a pure function so that this is a unit test rather than
 * something discovered on somebody's deployment.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { migrationFolderCandidates } from './migrate'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('where the migrations are looked for', () => {
  it('tries MIGRATIONS_DIR and nothing else when it is set', () => {
    /*
     * The only one, deliberately. An operator who sets it and gets it wrong must
     * be told so — falling through to a folder that happens to exist would apply
     * a different board's migrations without mentioning it.
     */
    expect(
      migrationFolderCandidates({ explicit: '/srv/sql', moduleDir: HERE, cwd: '/app' }),
    ).toEqual(['/srv/sql'])
  })

  it('prefers the folder beside this module, where a checkout has it', () => {
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: '/somewhere/else' })
    expect(first).toBe(path.resolve(HERE, '..', 'migrations'))
  })

  it('finds this repository’s own migrations that way', () => {
    /*
     * The claim above, checked against the tree rather than against itself. If
     * the SQL moves, this fails here rather than on the first install.
     */
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: HERE })
    expect(existsSync(path.join(first ?? '', 'meta', '_journal.json'))).toBe(true)
  })

  it('looks where the image puts it, for the runtimes with no module directory', () => {
    /*
     * `import.meta.url` is undefined in the CJS bundles esbuild produces, and the
     * standalone server's module directory is a `.next` chunk that never held
     * SQL. Both cases land here: the Dockerfile copies the migrations to
     * /app/migrations because they are data, and Next traces modules.
     */
    expect(migrationFolderCandidates({ cwd: '/app' })).toContain('/app/migrations')
  })

  it('walks up from the working directory, in both shapes', () => {
    const candidates = migrationFolderCandidates({ cwd: '/repo/apps/forum' })

    /* `next dev` runs in apps/forum; the workspace's SQL is three levels up. */
    expect(candidates).toContain(path.join('/repo', 'packages', 'db', 'migrations'))
    /* An image runs in /app, where the folder sits directly underneath. */
    expect(candidates).toContain(path.join('/repo/apps/forum', 'migrations'))
  })

  it('stops at the root rather than looping', () => {
    const candidates = migrationFolderCandidates({ cwd: '/' })
    expect(candidates.length).toBeLessThan(10)
    expect(candidates).toContain(path.join('/', 'migrations'))
  })

  it('puts the nearest directory first, so a checkout never reaches the image path', () => {
    const candidates = migrationFolderCandidates({ moduleDir: HERE, cwd: '/repo/apps/forum' })
    expect(candidates.indexOf(path.resolve(HERE, '..', 'migrations'))).toBe(0)
  })
})
