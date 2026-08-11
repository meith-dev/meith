import { defineConfig } from '@playwright/test'

import {
  E2E_DATABASE_URL,
  E2E_DB_PORT,
  E2E_DUES_WEBHOOK_SECRET,
  E2E_FAKE_STRIPE_PORT,
  E2E_INSTALL_BASE_URL,
  E2E_INSTALL_DATABASE_URL,
  E2E_INSTALL_DB_PORT,
  E2E_INSTALL_PORT,
  E2E_UPLOADS_DIR,
} from './e2e/support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

const INSTALL_SPECS = /install-[\w-]*\.spec\.ts$/

const TOUR_SPECS = /screenshot-[\w-]*\.spec\.ts$/
const BOARD_IGNORE = process.env.CI ? [INSTALL_SPECS, TOUR_SPECS] : [INSTALL_SPECS]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['./e2e/support/server-errors.ts']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  projects: [
    {
      name: 'board',
      testIgnore: BOARD_IGNORE,
    },
    {
      name: 'install',
      testMatch: INSTALL_SPECS,
      use: { baseURL: E2E_INSTALL_BASE_URL },
      timeout: 120_000,
    },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/support/database.ts',
      port: E2E_DB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm exec tsx e2e/support/fake-stripe.ts',
      port: E2E_FAKE_STRIPE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
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
        DUES_TEST_BOARD: '1',
        DUES_STRIPE_SECRET_KEY: 'sk_test_e2e_0000000000000000',
        DUES_STRIPE_WEBHOOK_SECRET: E2E_DUES_WEBHOOK_SECRET,
        DUES_STRIPE_API_BASE: `http://127.0.0.1:${E2E_FAKE_STRIPE_PORT}`,
      },
    },
    {
      command: 'pnpm exec tsx e2e/support/database.ts --empty',
      port: E2E_INSTALL_DB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm --filter @meith/web run dev --hostname 127.0.0.1 --port ${E2E_INSTALL_PORT}`,
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
