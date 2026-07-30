/**
 * drizzle-kit configuration.
 *
 * This file is tooling, not application code: it runs in a plain Node process
 * via the `drizzle-kit` CLI, before/outside the app, so it is one of the few
 * places allowed to touch process.env directly (see scripts/guards.mjs).
 *
 * `generate` needs only `schema`/`out`/`dialect`, which is why migrations can
 * be produced with no database provisioned at all. `migrate`, `push` and
 * `check` additionally need dbCredentials, and will fail with a clear message
 * if DATABASE_URL is absent.
 */

import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  // Keep generated SQL readable in review; Drizzle's default is fine but the
  // explicit setting documents that migrations are committed artefacts.
  verbose: true,
  strict: true,
  casing: 'snake_case',
  ...(url ? { dbCredentials: { url } } : {}),
})
