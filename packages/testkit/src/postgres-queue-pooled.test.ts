import { describe, expect, it } from 'vitest'

import { createIsolatedDb } from '@meith/db'

const POOLER = 'postgres://board:pw@pooler.example:6543/board'

describe('the connection the board opens for the queue', () => {
  it('never sends a named prepared statement, which a transaction pooler cannot keep', async () => {
    const connection = createIsolatedDb(POOLER, 1)
    const options = (connection.sql as unknown as { options: { prepare: boolean } }).options

    expect(options.prepare).toBe(false)

    await connection.close().catch(() => undefined)
  })
})
