import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { INSTALL_LOCK_KEY } from './install-repo'
import { MIGRATION_LOCK_KEY } from './migrate'

function keyFor(name: string): string {
  return createHash('sha256').update(name).digest().readBigInt64BE(0).toString()
}

describe('the advisory lock that serialises concurrent installs', () => {
  it('holds one stable key, so two installers racing still queue', () => {
    expect(INSTALL_LOCK_KEY).toBe('8626403014885544245')
    expect(BigInt(INSTALL_LOCK_KEY)).toBeLessThan(2n ** 63n)
  })

  it('derives the key the same way the migration lock does', () => {
    expect(INSTALL_LOCK_KEY).toBe(keyFor('meith:install'))
    expect(MIGRATION_LOCK_KEY).toBe(keyFor('meith:migrations'))
  })

  it('does not share the migration lock, which the install takes as one of its steps', () => {
    expect(INSTALL_LOCK_KEY).not.toBe(MIGRATION_LOCK_KEY)
  })
})
