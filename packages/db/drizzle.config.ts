import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  verbose: true,
  strict: true,
  casing: 'snake_case',
  ...(url ? { dbCredentials: { url } } : {}),
})
