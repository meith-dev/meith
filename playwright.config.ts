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

const INSTALL_SPECS = /install-[\w-]*\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  projects: [
    {
      name: 'board',
      testIgnore: INSTALL_SPECS,
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
