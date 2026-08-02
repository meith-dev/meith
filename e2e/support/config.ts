/**
 * Where the e2e database listens, and where its uploads go.
 *
 * Its own module, and deliberately holding nothing but constants.
 * `playwright.config.ts` is loaded by Playwright's own TypeScript transform as
 * CommonJS, and `database.ts` uses `import.meta.url` — which forces ESM and
 * makes the config fail to load. A leaf file is the whole fix, and it keeps the
 * port from being written down twice.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const E2E_DB_PORT = 55_432

export const E2E_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`

/**
 * Where uploaded files land.
 *
 * Outside the repository on purpose: `next dev` watches its own project
 * directory, so an upload written inside it is a filesystem change that can
 * restart the server in the middle of a test.
 */
export const E2E_UPLOADS_DIR = join(tmpdir(), 'forum-e2e-uploads')
