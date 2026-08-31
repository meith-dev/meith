import { defineConfig } from '@playwright/test'

import { standaloneRoot, standaloneServer } from './e2e/support/board-paths'
import {
  E2E_BASE_URL,
  E2E_DATABASE_URL,
  E2E_DB_PORT,
  E2E_DUES_WEBHOOK_SECRET,
  E2E_FAKE_MAIL_ENDPOINT,
  E2E_FAKE_MAIL_PORT,
  E2E_FAKE_MAIL_TOKEN,
  E2E_FAKE_MARKETPLACE_PORT,
  E2E_FAKE_STRIPE_PORT,
  E2E_INSTALL_BASE_URL,
  E2E_INSTALL_DATABASE_URL,
  E2E_INSTALL_DB_PORT,
  E2E_INSTALL_PORT,
  E2E_MAIL_FROM,
  E2E_PORT,
  E2E_TICK_SECRET,
  E2E_UPLOADS_DIR,
} from './e2e/support/config'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

const INSTALL_SPECS = /install-[\w-]*\.spec\.ts$/

const TOUR_SPECS = /screenshot-[\w-]*\.spec\.ts$/

const SITE_SHOT_SPECS = /screenshot-site\.spec\.ts$/

const BOARD_IGNORE = process.env.CI ? [INSTALL_SPECS, TOUR_SPECS] : [INSTALL_SPECS, SITE_SHOT_SPECS]

const BOARD_SERVER = {
  command: `node ${standaloneServer()}`,
  cwd: standaloneRoot(),
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
}

const SHARED_ENV = {
  DATA_SOURCE: 'postgres',
  DATABASE_POOL_MAX: '1',
  QUEUE_DRIVER: 'postgres',
  CACHE_DRIVER: 'memory',
  FILESTORE_DRIVER: 'local',
  AUTH_SECRET: 'e2e-only-secret-0000000000000000',
  TICK_SECRET: E2E_TICK_SECRET,
  HOSTNAME: '127.0.0.1',
  NEXT_TELEMETRY_DISABLED: '1',
  MAIL_ALLOW_PRIVATE_HOSTS: 'true',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['./e2e/support/flaky-notice.ts'], ['./e2e/support/server-errors.ts']],
  use: {
    baseURL: E2E_BASE_URL,
    timezoneId: 'UTC',
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
      command: 'pnpm exec tsx e2e/support/fake-marketplace.ts',
      port: E2E_FAKE_MARKETPLACE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm exec tsx e2e/support/fake-mail.ts',
      port: E2E_FAKE_MAIL_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
    },
    {
      ...BOARD_SERVER,
      url: E2E_BASE_URL,
      env: {
        ...SHARED_ENV,
        PORT: String(E2E_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        UPLOADS_DIR: E2E_UPLOADS_DIR,
        MAIL_DRIVER: 'http',
        MAIL_FROM: E2E_MAIL_FROM,
        MAIL_HTTP_ENDPOINT: E2E_FAKE_MAIL_ENDPOINT,
        MAIL_HTTP_TOKEN: E2E_FAKE_MAIL_TOKEN,
        SHOWCASE_THEMES: '1',
        DUES_TEST_BOARD: '1',
        DUES_CURRENCY: 'gbp',
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
      ...BOARD_SERVER,
      url: `${E2E_INSTALL_BASE_URL}/install`,
      env: {
        ...SHARED_ENV,
        PORT: String(E2E_INSTALL_PORT),
        DATABASE_URL: E2E_INSTALL_DATABASE_URL,
        UPLOADS_DIR: `${E2E_UPLOADS_DIR}-install`,
      },
    },
  ],
})
