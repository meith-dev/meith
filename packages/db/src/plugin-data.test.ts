import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import { bindPluginSql, pluginData } from './plugin-data'
import { resultRows } from './result-rows'

let h: TestDb

beforeAll(async () => {
  h = await createTestDb()
  await h.client.exec(
    'create table if not exists plugin_example_note (id serial primary key, note text)',
  )
})
afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.client.exec('delete from plugin_example_note')
  h.queries.reset()
})

describe('parameter binding', () => {
  it('binds $1-style placeholders through the driver, not by interpolation', async () => {
    const data = pluginData(h.db, 'example')

    await data.query('insert into plugin_example_note (note) values ($1)', ["Robert'); drop"])
    const rows = await data.query<{ note: string }>(
      'select note from plugin_example_note where note = $1',
      ["Robert'); drop"],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.note).toBe("Robert'); drop")
  })

  it('reuses one parameter in several places', async () => {
    const data = pluginData(h.db, 'example')
    const [row] = await data.query<{ a: string; b: string }>('select $1 as a, $1 as b', ['x'])
    expect(row).toEqual({ a: 'x', b: 'x' })
  })

  it('refuses a placeholder with no parameter behind it', () => {
    expect(() => bindPluginSql('select $2', ['only one'])).toThrow(/\$2/)
  })
})

describe('one', () => {
  it('returns the first row, or null', async () => {
    const data = pluginData(h.db, 'example')
    expect(await data.one('select note from plugin_example_note')).toBeNull()

    await data.query('insert into plugin_example_note (note) values ($1), ($2)', ['a', 'b'])
    const row = await data.one<{ note: string }>('select note from plugin_example_note order by id')
    expect(row).toEqual({ note: 'a' })
  })
})

describe('transactions', () => {
  it('commits everything in work together', async () => {
    const data = pluginData(h.db, 'example')

    await data.tx(async (tx) => {
      await tx.query('insert into plugin_example_note (note) values ($1)', ['one'])
      await tx.query('insert into plugin_example_note (note) values ($1)', ['two'])
    })

    expect(await data.query('select * from plugin_example_note')).toHaveLength(2)
  })

  it('rolls everything back when work throws', async () => {
    const data = pluginData(h.db, 'example')

    await expect(
      data.tx(async (tx) => {
        await tx.query('insert into plugin_example_note (note) values ($1)', ['doomed'])
        throw new Error('no')
      }),
    ).rejects.toThrow('no')

    expect(await data.query('select * from plugin_example_note')).toHaveLength(0)
  })

  it('a nested tx joins the outer transaction', async () => {
    const data = pluginData(h.db, 'example')

    await expect(
      data.tx(async (outer) => {
        await outer.tx(async (inner) => {
          await inner.query('insert into plugin_example_note (note) values ($1)', ['nested'])
        })
        throw new Error('undo it all')
      }),
    ).rejects.toThrow('undo it all')

    expect(await data.query('select * from plugin_example_note')).toHaveLength(0)
  })
})

describe('the statement timeout', () => {
  it('is in force for the statements a call runs', async () => {
    const data = pluginData(h.db, 'example', { statementTimeoutMs: 1234 })
    const row = await data.one<{ statement_timeout: string }>('show statement_timeout')
    expect(row!.statement_timeout).toBe('1234ms')
  })

  it('is local to the call, not left on the connection', async () => {
    await pluginData(h.db, 'example', { statementTimeoutMs: 1234 }).query('select 1')
    const rows = resultRows<{ statement_timeout: string }>(
      await h.db.execute(sql`show statement_timeout`),
    )
    expect(rows[0]!.statement_timeout).not.toBe('1234ms')
  })

  it('floors at one millisecond rather than accepting "no limit"', async () => {
    const data = pluginData(h.db, 'example', { statementTimeoutMs: 0 })
    const row = await data.one<{ statement_timeout: string }>('show statement_timeout')
    expect(row!.statement_timeout).toBe('1ms')
  })
})
