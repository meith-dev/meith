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

/* ------------------------------------------------------------------ *
 * The accounts a spec cannot register
 * ------------------------------------------------------------------ */

/**
 * The password the seeded staff accounts share.
 *
 * Here rather than beside the seed that hashes it, for this file's stated
 * reason: `database.ts` forces ESM and cannot be imported by a spec. A
 * constants leaf both sides can read is the whole fix, and it keeps the
 * credential from being written down twice.
 */
export const STAFF_PASSWORD = 'long-enough-password'

/**
 * The two accounts the browser suite cannot create for itself.
 *
 * A registration always lands in the Registered group, so a suite where every
 * account registers can never open the control panel, act on the moderation
 * queue or close a report — which is exactly why those had no browser coverage
 * at all. Staff is seeded, in `database.ts`, with a real password; these are
 * the names it seeds under.
 */
export const STAFF = {
  admin: { id: 1, username: 'admin' },
  moderator: { id: 9002, username: 'e2e_moderator' },
} as const

export const E2E_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`

/* ------------------------------------------------------------------ *
 * The installer's own stack
 * ------------------------------------------------------------------ */

/**
 * A second database, with **no schema at all**.
 *
 * `/install` is the one screen that cannot run against the board above: it
 * refuses to render a form when the database already holds accounts, and its
 * first step is applying the migrations that database already has. Testing it
 * needs an empty one — which `plan-status.md` recorded as the reason F83 had no
 * browser coverage, feature after feature.
 *
 * A second PGlite is the whole fix. It costs one more WASM instance, which is
 * cheap next to being unable to test the first screen anybody sees.
 */
export const E2E_INSTALL_DB_PORT = 55_433

export const E2E_INSTALL_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${E2E_INSTALL_DB_PORT}/postgres`

/**
 * A second app, pointed at that database.
 *
 * `DATABASE_URL` is read once at boot, so an install spec cannot borrow the
 * board's server — and it must not, because installing *seals* the board it runs
 * against. One server per database keeps the two suites from destroying each
 * other's fixture.
 */
export const E2E_INSTALL_PORT = 3002

export const E2E_INSTALL_BASE_URL = `http://127.0.0.1:${E2E_INSTALL_PORT}`

/**
 * Where uploaded files land.
 *
 * Outside the repository on purpose: `next dev` watches its own project
 * directory, so an upload written inside it is a filesystem change that can
 * restart the server in the middle of a test.
 */
export const E2E_UPLOADS_DIR = join(tmpdir(), 'forum-e2e-uploads')
