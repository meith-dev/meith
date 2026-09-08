import { defineConfig } from '@playwright/test'

import { FIXTURE_BASE_URL, FIXTURE_PORT } from './support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: '.',
  testMatch: /screenshot-site\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: FIXTURE_BASE_URL,
    timezoneId: 'UTC',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: `pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port ${FIXTURE_PORT}`,
    url: FIXTURE_BASE_URL,
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      DATA_SOURCE: 'fixture',
      DATABASE_URL: '',
      QUEUE_DRIVER: 'memory',
      CACHE_DRIVER: 'memory',
      AUTH_SECRET: 'shots-only-secret-00000000000000',
      APP_URL: FIXTURE_BASE_URL,
      FORUM_DIST_DIR: '.next-shots',
      NEXT_TELEMETRY_DISABLED: '1',
      SHOWCASE_THEMES: '1',
    },
  },
})
