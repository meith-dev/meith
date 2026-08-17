import { resetEnvForTests } from '@meith/core'
import type { Database } from '@meith/db'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetDemoBoard } from './reset'

const neverReached = {
  execute() {
    throw new Error('The reset touched the database before checking DEMO_MODE.')
  },
} as unknown as Database

function inDemoMode(): void {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
}

/** Records the statements a reset issues, and answers all of them. */
function recordingDb(): { db: Database; statements: string[] } {
  const statements: string[] = []
  const db = {
    execute(query: unknown) {
      const text = JSON.stringify(query)
      statements.push(
        /drop schema if exists drizzle/.test(text)
          ? 'drop drizzle'
          : /drop schema if exists public/.test(text)
            ? 'drop public'
            : /create schema if not exists public/.test(text)
              ? 'recreate public'
              : /create schema public/.test(text)
                ? 'create public'
                : 'other',
      )
      return Promise.resolve([])
    },
  } as unknown as Database

  return { db, statements }
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('resetDemoBoard', () => {
  it('refuses to run on a board that is not a demo, before touching anything', async () => {
    await expect(resetDemoBoard({ db: neverReached })).rejects.toThrow(/DEMO_MODE is not set/)
  })

  it('says what it would have destroyed, so the message is not just a rule', async () => {
    await expect(resetDemoBoard({ db: neverReached })).rejects.toThrow(/end of the board/)
  })

  /**
   * The reset runs from the scheduler, and the scheduler's own bookkeeping table
   * is in the schema the reset drops. A reset that dies after the drop and does
   * not put the schema back takes the scheduler with it, so nothing ever retries
   * and the board stays empty until a human notices.
   */
  it('puts the schema back when the migration fails after the drop', async () => {
    inDemoMode()
    const { db, statements } = recordingDb()

    let attempts = 0
    const migrate = (): Promise<number> => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new Error('connection reset'))
      return Promise.resolve(35)
    }

    await expect(resetDemoBoard({ db, migrate })).rejects.toThrow(/connection reset/)

    expect(attempts).toBe(2)
    expect(statements).toContain('recreate public')
  })

  it('reports the original failure, not whatever the recovery did', async () => {
    inDemoMode()
    const { db } = recordingDb()

    await expect(
      resetDemoBoard({ db, migrate: () => Promise.reject(new Error('the real problem')) }),
    ).rejects.toThrow(/the real problem/)
  })

  it('does not leave a board unrecoverable just because recovery also failed', async () => {
    inDemoMode()
    const { db } = recordingDb()

    await expect(
      resetDemoBoard({ db, migrate: () => Promise.reject(new Error('disk is gone')) }),
    ).rejects.toThrow(/disk is gone/)
  })
})
