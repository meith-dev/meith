import { defineConfig } from '@playwright/test'

import {
  E2E_DATABASE_URL,
  E2E_DB_PORT,
  E2E_INSTALL_BASE_URL,
  E2E_INSTALL_DATABASE_URL,
  E2E_INSTALL_DB_PORT,
  E2E_INSTALL_PORT,
  E2E_UPLOADS_DIR,
} from './e2e/support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

/**
 * Which specs belong to the installer's stack.
 *
 * A naming rule rather than a list, so a second install spec joins the right
 * project by being called `install-…` — and, more importantly, so it cannot join
 * the *board* project by accident and seal the fixture every other spec reads.
 * The two projects share this constant for exactly that reason: one regex, used
 * once to include and once to exclude, cannot drift into overlapping or leaving
 * a gap.
 */
const INSTALL_SPECS = /install-[\w-]*\.spec\.ts$/

/**
 * The browser suite runs against a real Postgres.
 *
 * Until this change it ran against `DATA_SOURCE=fixture`, which serves sample
 * data from memory and has **no writer for anything** — so the suite covered
 * reading only, and had done since F39 while ten features were built on top of
 * it. `plan-status.md` recorded that hole feature after feature without it
 * moving.
 *
 * It did not move because the obvious fix meant a service somebody has to
 * install, which would have made write-path e2e a CI-only capability — and a
 * test path that only exists in CI is one nobody runs before pushing.
 * `e2e/support/database.ts` is what makes it free: PGlite, the same Postgres
 * build the integration suite has trusted for a hundred files, behind the
 * Postgres wire protocol — so `next dev` connects with an ordinary
 * `DATABASE_URL` and does not know the difference.
 *
 * **Two servers, and the order matters.** Playwright starts `webServer` entries
 * sequentially, and before `globalSetup`, so the database goes first: its port
 * is open, its migrations applied and its rows in before the app is launched.
 * That is why this is a `webServer` and not a `globalSetup` — the latter runs
 * *after* the app, which is too late for a health check that reads the board.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  /**
   * One retry, for the one thing that is not the test's fault: `next dev`
   * restarts itself part-way through the run.
   *
   * It is not a guess. The dev server checks, in the `finally` of every request:
   *
   * ```js
   * if (v8.getHeapStatistics().used_heap_size > 0.8 * heap_size_limit) {
   *   log.warn('Server is approaching the used memory threshold, restarting...')
   * ```
   *
   * Twenty minutes of Turbopack compiling every route crosses that — 6.6 GB of
   * an 8.2 GB ceiling here — and while the server bounces, the port is closed.
   * Whichever navigation is in flight at that instant gets
   * `ERR_CONNECTION_REFUSED`, and *which test that is* is decided by the clock.
   * Two full runs put it on two unrelated specs, one of which nobody had
   * touched in months.
   *
   * Raising the heap is the wrong lever: the trigger is a ratio, an unknown
   * share of that 6.6 GB is garbage V8 has not bothered to collect because it
   * has room, and a bigger ceiling either changes nothing or turns a
   * self-healing restart into an OOM kill on a box that is also holding two
   * PGlite instances and a browser.
   *
   * **One, and it hides nothing.** The restart is transient and self-healing,
   * so a second attempt against the server that came back passes
   * deterministically — while a test that is genuinely unstable fails twice and
   * still fails the run. Anything that passes on the retry is reported as
   * `flaky` in the summary rather than as a pass, so a real flake arriving here
   * is louder than it was before, not quieter. Raise this number and that stops
   * being true.
   */
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  /**
   * Two boards, because the installer destroys the one it runs on.
   *
   * Every other spec reads and writes the *seeded* board. `/install` needs a
   * database with no schema — its first step is applying the migrations, and its
   * preflight refuses to render a form once any account exists — and then it
   * **seals** that database, so it is a fixture exactly one spec can consume.
   *
   * `plan-status.md` has recorded "no e2e spec drives the installer, because the
   * harness has no empty-database fixture" since F83. This is that fixture: a
   * second PGlite and a second `next dev`, each pointed at the other's opposite.
   */
  projects: [
    {
      name: 'board',
      testIgnore: INSTALL_SPECS,
    },
    {
      name: 'install',
      testMatch: INSTALL_SPECS,
      use: { baseURL: E2E_INSTALL_BASE_URL },
      /*
       * Headroom, not an estimate: the spec takes about eight seconds.
       *
       * It is one test rather than several (see the spec for why), and it does
       * real work in a single span — all thirty-odd migrations **twice**, since
       * the first attempt is refused at the administrator and pressing Try again
       * re-runs the migrate step, which is exactly the retry-safety the
       * installer promises — plus two Argon2id hashes and a first compile of
       * every route it visits. On a loaded runner the default 30s is close
       * enough to that to be a coin flip, and a spec that fails one run in three
       * teaches people to re-run it, after which a real failure gets re-run too.
       */
      timeout: 120_000,
    },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/support/database.ts',
      /*
       * A TCP port rather than a URL: this speaks the Postgres protocol, and it
       * only starts listening once the schema and the seed rows are in. Waiting
       * on the port is therefore waiting on a ready board.
       */
      port: E2E_DB_PORT,
      /*
       * Never reused, even locally. The suite writes — that is the entire point
       * of this change — so a second run against a database the first one
       * posted into would pass or fail for reasons unrelated to the code.
       */
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port 3001',
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        DATA_SOURCE: 'postgres',
        DATABASE_URL: E2E_DATABASE_URL,
        /* One connection. See `maxConnections` in `e2e/support/database.ts`. */
        DATABASE_POOL_MAX: '1',
        /*
         * The **Postgres** queue, not the memory one. A queued job is drained by
         * `/api/system/tick`, which a spec hits directly — and with an in-process
         * queue that only works while the process that enqueued survives to the
         * drain. `next dev` restarts on a file change, so the memory queue made
         * the attachment spec intermittently lose its job. Rows in a table do
         * not have that failure mode, and it is what production runs anyway.
         */
        QUEUE_DRIVER: 'postgres',
        CACHE_DRIVER: 'memory',
        FILESTORE_DRIVER: 'local',
        /*
         * Outside the repository. `next dev` watches its own project directory,
         * and uploads landing inside it are a write that can trigger a reload
         * mid-test — which is the same flake by another route.
         */
        UPLOADS_DIR: E2E_UPLOADS_DIR,
        AUTH_SECRET: 'e2e-only-secret-0000000000000000',
        TICK_SECRET: 'e2e-only-tick-secret-000000000000',
        FORUM_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    /*
     * The installer's empty database. Same file, `--empty`, different port.
     */
    {
      command: 'pnpm exec tsx e2e/support/database.ts --empty',
      port: E2E_INSTALL_DB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    /*
     * The installer's app.
     *
     * `DATABASE_URL` is read once at boot, so this cannot be the server above
     * with a different variable — and it must not be, because a spec that
     * installs would seal the board every other spec reads.
     *
     * `APP_URL` is deliberately **unset**, unlike the board server: with it set
     * the form does not render the board-address box at all (the environment
     * owns it), and that box is one of the things worth proving. The Coolify
     * shape — `APP_URL` set, no box — is covered by `withEnvironmentAnswers`'
     * unit tests, which is where a substitution rule belongs.
     *
     * Its own `FORUM_DIST_DIR`: two `next dev` processes sharing a build
     * directory race each other's manifests, which fails in a way that looks
     * like a routing bug.
     */
    {
      command: `pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port ${E2E_INSTALL_PORT}`,
      /*
       * `/install`, not `/`.
       *
       * The database behind this server has no schema, so the board's index
       * cannot render — every page that reads a forum or resolves an actor
       * fails, correctly. `/install` is the one route written to work anyway
       * ("this page also has to render when the database is unreachable"), which
       * makes it both the right health check and a standing assertion of that
       * property: if it ever starts needing a table, this harness stops booting.
       */
      url: `${E2E_INSTALL_BASE_URL}/install`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        DATA_SOURCE: 'postgres',
        DATABASE_URL: E2E_INSTALL_DATABASE_URL,
        DATABASE_POOL_MAX: '1',
        QUEUE_DRIVER: 'postgres',
        CACHE_DRIVER: 'memory',
        FILESTORE_DRIVER: 'local',
        UPLOADS_DIR: `${E2E_UPLOADS_DIR}-install`,
        AUTH_SECRET: 'e2e-only-secret-0000000000000000',
        TICK_SECRET: 'e2e-only-tick-secret-000000000000',
        FORUM_DIST_DIR: '.next-e2e-install',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
})
