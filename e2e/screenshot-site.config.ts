import { defineConfig } from '@playwright/test'

import {
  DEMO_BASE_URL,
  DEMO_DATABASE_URL,
  DEMO_PORT,
  DEMO_READY_PORT,
  DEMO_UPLOADS_DIR,
} from './support/config'

/*
 * The photographer's config, run by `pnpm site:shots` and by nothing else.
 *
 * A config of its own rather than a project in `playwright.config.ts`, because
 * the board it needs is a different board: demo mode, the showcase themes and
 * the Dues shop, on ports of its own. Folding it into the main config would
 * boot all of that for every `pnpm test:e2e` run, to serve one spec that is not
 * a test and does not assert anything.
 *
 * It is also why the shots are not captured on CI. They are a deliberate act
 * with a reviewable diff — a hundred kilobytes of PNG landing in a pull request
 * because a seed date moved is noise, and nobody reviews a binary that changed
 * on its own.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: '.',
  testMatch: /screenshot-site\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: DEMO_BASE_URL,
    timezoneId: 'UTC',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: [
    {
      command: 'pnpm exec tsx e2e/support/demo-board.ts',
      // Not the database port. See DEMO_READY_PORT in ./support/config.
      port: DEMO_READY_PORT,
      reuseExistingServer: true,
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port ${DEMO_PORT}`,
      url: DEMO_BASE_URL,
      reuseExistingServer: true,
      timeout: 300_000,
      env: {
        DATA_SOURCE: 'postgres',
        DATABASE_URL: DEMO_DATABASE_URL,
        // One, as the behaviour specs also run. PGlite serves every socket from
        // a single instance, so two pooled connections interleave on the same
        // unnamed prepared statement and the board fails its own queries.
        DATABASE_POOL_MAX: '1',
        QUEUE_DRIVER: 'postgres',
        CACHE_DRIVER: 'memory',
        FILESTORE_DRIVER: 'local',
        UPLOADS_DIR: DEMO_UPLOADS_DIR,
        AUTH_SECRET: 'shots-only-secret-00000000000000',
        TICK_SECRET: 'shots-only-tick-secret-0000000000',
        APP_URL: DEMO_BASE_URL,
        FORUM_DIST_DIR: '.next-shots',
        NEXT_TELEMETRY_DISABLED: '1',
        // The board the site is selling: every theme it ships, and the shop.
        DEMO_MODE: '1',
        SHOWCASE_THEMES: '1',
        DUES_STRIPE_SECRET_KEY: 'sk_test_shots_00000000000000000',
        DUES_STRIPE_WEBHOOK_SECRET: 'whsec_shots_signing_secret',
        DUES_STRIPE_API_BASE: `${DEMO_BASE_URL}/demo/stripe`,
      },
    },
  ],
})
