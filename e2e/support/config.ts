import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const E2E_DB_PORT = 55_432

export const E2E_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`

export const E2E_UPLOADS_DIR = join(tmpdir(), 'forum-e2e-uploads')
