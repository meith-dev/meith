/**
 * The budget helper has to be trusted before anything relies on it, so this
 * proves it counts real statements and actually fails when the budget is blown.
 */
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { schema } from '@meith/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { expectQueryBudget, measureQueries } from './query-budget'

let harness: TestDb

beforeAll(async () => {
  harness = await createTestDb()
})
afterAll(async () => {
  await harness.close()
})

describe('measureQueries', () => {
  it('counts one statement per query', async () => {
    const { count } = await measureQueries(harness, async () => {
      await harness.db.select().from(schema.usergroups).limit(1)
    })
    expect(count).toBe(1)
  })

  it('counts a loop as one statement per iteration — the N+1 shape', async () => {
    const { count } = await measureQueries(harness, async () => {
      for (const id of [1, 2, 3, 4, 5]) {
        await harness.db
          .select()
          .from(schema.usergroups)
          .where(eq(schema.usergroups.id, id))
      }
    })
    expect(count).toBe(5)
  })

  it('does not count the migration that built the schema', async () => {
    const { count } = await measureQueries(harness, async () => {})
    expect(count).toBe(0)
  })

  it('resets between measurements', async () => {
    await measureQueries(harness, async () => {
      await harness.db.select().from(schema.usergroups)
    })
    const second = await measureQueries(harness, async () => {})
    expect(second.count).toBe(0)
  })
})

describe('expectQueryBudget', () => {
  it('passes within budget and returns the value', async () => {
    const value = await expectQueryBudget(harness, 2, async () => {
      await harness.db.select().from(schema.usergroups).limit(1)
      return 'ok'
    })
    expect(value).toBe('ok')
  })

  /*
   * The assertion this whole helper exists for. If it cannot fail, every "no
   * N+1" claim built on it is decoration.
   */
  it('fails when the budget is exceeded', async () => {
    await expect(
      expectQueryBudget(harness, 2, async () => {
        for (const id of [1, 2, 3, 4, 5]) {
          await harness.db
            .select()
            .from(schema.usergroups)
            .where(eq(schema.usergroups.id, id))
        }
      }),
    ).rejects.toThrow(/Query budget exceeded: 5 statements, budget 2/)
  })

  it('names the repeated statement, so the N+1 is identifiable', async () => {
    let message = ''
    try {
      await expectQueryBudget(harness, 1, async () => {
        for (const id of [1, 2, 3]) {
          await harness.db
            .select()
            .from(schema.usergroups)
            .where(eq(schema.usergroups.id, id))
        }
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    // "3× select ..." is what turns a number into a diagnosis. The table name
    // lives at the end of drizzle's column list, so the message must elide from
    // the middle to keep it.
    expect(message).toMatch(/3×/)
    expect(message).toMatch(/usergroups/)
  })
})
