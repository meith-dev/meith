import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const E2E_DB_PORT = 55_432

export const STAFF_PASSWORD = 'long-enough-password'

export const STAFF = {
  admin: { id: 1, username: 'admin' },
  moderator: { id: 9002, username: 'e2e_moderator' },
} as const

export const E2E_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`

export const E2E_INSTALL_DB_PORT = 55_433

export const E2E_INSTALL_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_INSTALL_DB_PORT}/postgres`

export const E2E_INSTALL_PORT = 3002

export const E2E_INSTALL_BASE_URL = `http://127.0.0.1:${E2E_INSTALL_PORT}`

export const E2E_UPLOADS_DIR = join(tmpdir(), 'forum-e2e-uploads')

export const E2E_FAKE_STRIPE_PORT = 12_111

export const E2E_DUES_WEBHOOK_SECRET = 'whsec_e2e_dues_signing_secret'

export const DEMO_DB_PORT = 55_434

export const DEMO_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${DEMO_DB_PORT}/postgres`

export const DEMO_READY_PORT = 55_435

export const DEMO_PORT = 3003

export const DEMO_BASE_URL = `http://127.0.0.1:${DEMO_PORT}`

export const DEMO_UPLOADS_DIR = join(tmpdir(), 'meith-demo-shot-uploads')
