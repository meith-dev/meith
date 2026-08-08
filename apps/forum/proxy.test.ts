/**
 * The one thing about the proxy a type cannot check: that the routes it claims
 * to protect exist.
 *
 * `PROTECTED_PREFIXES` is a list of strings compared against a pathname, so a
 * name that no longer matches anything is not an error anywhere — it is simply
 * a rule that never fires. That is what happened: the list read
 * `['/settings', '/messages', '/modcp', '/admincp']` while the routes were
 * `/usercp` and `/admin`, so two entries guarded nothing and four member-facing
 * panels were guarded by nothing. The visible symptom was a signed-out visitor
 * getting a login form at `/messages` and a bare 404 at `/usercp`, which the
 * audit of 7 August 2026 recorded as an inconsistency and this is the cause of.
 *
 * Resolving each prefix against `app/` is the whole test, and it is the kind of
 * check the invariant scripts exist for: a fact about the repository that every
 * other gate is blind to.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES } from './proxy'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Where a prefix's route directory would be.
 *
 * Both shapes are tried because the board's routes are split across two route
 * groups: `/usercp` is `app/(board)/usercp` and `/admin` is `app/admin`. A
 * group is a directory in parentheses and contributes nothing to the URL, so
 * "does this path exist" has to ask about each of them.
 */
function routeDirectories(prefix: string): readonly string[] {
  const segment = prefix.replace(/^\//, '')
  return [
    path.join(here, 'app', segment),
    path.join(here, 'app', '(board)', segment),
    path.join(here, 'app', '(auth)', segment),
  ]
}

describe('PROTECTED_PREFIXES', () => {
  it('names only routes that exist', () => {
    const missing = PROTECTED_PREFIXES.filter(
      (prefix) => !routeDirectories(prefix).some((dir) => existsSync(dir)),
    )

    expect(missing).toEqual([])
  })

  it('covers every member-facing panel a guest could be sent to sign in for', () => {
    /*
     * Named rather than derived. Deriving the list from the filesystem would
     * make this test agree with whatever the code does, which is the one thing
     * a test must not do — the point is that somebody decided these seven are
     * gated, and a route added under them inherits the decision by prefix.
     */
    expect([...PROTECTED_PREFIXES].sort()).toEqual([
      '/admin',
      '/messages',
      '/modcp',
      '/moderation',
      '/notifications',
      '/subscriptions',
      '/usercp',
    ])
  })

  it('has no prefix that is a prefix of another, which would be a dead entry', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      const shadowed = PROTECTED_PREFIXES.filter(
        (other) => other !== prefix && prefix.startsWith(`${other}/`),
      )
      expect(shadowed).toEqual([])
    }
  })
})
