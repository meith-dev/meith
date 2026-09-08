import { ConfigurationError, env } from '@meith/core'
import { createIsolatedDb } from '@meith/db'

import { seedSql } from '../e2e/support/database'

if (!env.DATABASE_URL)
  throw new ConfigurationError('DATABASE_URL is required to seed a test board.')

const database = createIsolatedDb(env.DATABASE_URL)
try {
  await database.sql.unsafe(seedSql('x'))
} finally {
  await database.close()
}
