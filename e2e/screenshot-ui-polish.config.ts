import { defineConfig } from '@playwright/test'

import config from './screenshot-site.config'

export default defineConfig({
  ...config,
  outputDir: '../test-results/ui-capture-run',
  testMatch: /screenshot-ui-polish\.spec\.ts$/,
  timeout: 600_000,
  expect: { timeout: 30_000 },
})
