import { describe, expect, it } from 'vitest'

import { restoreDatabaseUrl } from './backup'

describe('restoreDatabaseUrl', () => {
  it('reads the target from the environment', () => {
    const target = 'postgres://user:secret@localhost/restored'
    expect(restoreDatabaseUrl(['board.tar.gz'], { RESTORE_DATABASE_URL: target })).toBe(target)
  })

  it('rejects a missing environment variable', () => {
    expect(() => restoreDatabaseUrl(['board.tar.gz'], {})).toThrow(/RESTORE_DATABASE_URL/)
  })

  it('rejects the observable command-line flag without echoing its value', () => {
    const secret = 'never-print-this'
    const args = ['board.tar.gz', '--database-url', `postgres://user:${secret}@db/board`]
    expect(() => restoreDatabaseUrl(args, {})).toThrow(/not supported/)
    try {
      restoreDatabaseUrl(args, {})
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
