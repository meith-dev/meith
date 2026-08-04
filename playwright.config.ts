import { defineConfig } from '@playwright/test'

import { E2E_DATABASE_URL, E2E_DB_PORT, E2E_UPLOADS_DIR } from './e2e/support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

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
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
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
  ],
})
