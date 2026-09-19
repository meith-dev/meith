import { resolve } from 'node:path'

import { defineConfig } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const baseURL = 'http://localhost:3100'

export default defineConfig({
  testDir: '.',
  testMatch: 'marketing.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  outputDir: '../../../test-results/site',
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: 'pnpm site:dev --hostname localhost',
    cwd: resolve(__dirname, '../../..'),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
})
