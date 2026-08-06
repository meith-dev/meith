import { defineConfig } from '@playwright/test'

import { E2E_DATABASE_URL, E2E_DB_PORT, E2E_UPLOADS_DIR } from './e2e/support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

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
      port: E2E_DB_PORT,
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
        DATABASE_POOL_MAX: '1',
        QUEUE_DRIVER: 'postgres',
        CACHE_DRIVER: 'memory',
        FILESTORE_DRIVER: 'local',
        UPLOADS_DIR: E2E_UPLOADS_DIR,
        AUTH_SECRET: 'e2e-only-secret-0000000000000000',
        TICK_SECRET: 'e2e-only-tick-secret-000000000000',
        FORUM_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
})
