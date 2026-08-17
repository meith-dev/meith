import { defineConfig } from '@playwright/test'

import {
  DEMO_BASE_URL,
  DEMO_DATABASE_URL,
  DEMO_PORT,
  DEMO_READY_PORT,
  DEMO_UPLOADS_DIR,
} from './support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

const DEMO_ENV = {
  DATA_SOURCE: 'postgres',
  DATABASE_URL: DEMO_DATABASE_URL,
  DATABASE_POOL_MAX: '1',
  QUEUE_DRIVER: 'postgres',
  CACHE_DRIVER: 'memory',
  FILESTORE_DRIVER: 'local',
  UPLOADS_DIR: DEMO_UPLOADS_DIR,
  DEMO_MODE: '1',
  SHOWCASE_THEMES: '1',
} as const

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
      port: DEMO_READY_PORT,
      reuseExistingServer: true,
      timeout: 300_000,
      stdout: 'pipe',
      env: { ...DEMO_ENV, LOG_LEVEL: 'warn' },
    },
    {
      command: `pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port ${DEMO_PORT}`,
      url: DEMO_BASE_URL,
      reuseExistingServer: true,
      timeout: 300_000,
      env: {
        ...DEMO_ENV,
        AUTH_SECRET: 'shots-only-secret-00000000000000',
        TICK_SECRET: 'shots-only-tick-secret-0000000000',
        APP_URL: DEMO_BASE_URL,
        FORUM_DIST_DIR: '.next-shots',
        NEXT_TELEMETRY_DISABLED: '1',
        DUES_STRIPE_SECRET_KEY: 'sk_test_shots_00000000000000000',
        DUES_STRIPE_WEBHOOK_SECRET: 'whsec_shots_signing_secret',
        DUES_STRIPE_API_BASE: `${DEMO_BASE_URL}/demo/stripe`,
      },
    },
  ],
})
